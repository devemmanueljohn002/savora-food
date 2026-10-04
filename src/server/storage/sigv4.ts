import { createHash, createHmac } from "node:crypto";

/**
 * Minimal AWS Signature Version 4 implementation (no SDK dependency).
 *
 * Implements exactly the algorithm in the AWS General Reference
 * ("Create a signed AWS API request"): canonical request → string to sign →
 * derived signing key → hex signature. Used for S3 Authorization-header
 * requests, presigned GET URLs, and presigned POST policies.
 *
 * Verified against the official AWS worked example (IAM ListUsers,
 * 20150830T123600Z) in tests/vendor-profile-photo.test.ts.
 */

export type SigCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** `20150830T123600Z` / `20150830` pair for the credential scope. */
export function amzTimestamp(date = new Date()): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/**
 * AWS UriEncode: every byte except A-Z a-z 0-9 - . _ ~, uppercase hex,
 * space as %20. Slashes are NOT encoded inside object-key paths, so path
 * segments are encoded individually by uriEncodePath().
 */
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => {
    return `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

export function uriEncodePath(path: string): string {
  const prefix = path.startsWith("/") ? "/" : "";
  return (
    prefix +
    path
      .split("/")
      .filter((segment, index) => !(index === 0 && segment === ""))
      .map((segment) => uriEncode(segment))
      .join("/")
  );
}

function canonicalQueryString(params: Array<[string, string]>): string {
  return params
    .map(([name, value]) => `${uriEncode(name)}=${uriEncode(value)}` as const)
    .sort()
    .join("&");
}

export function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const dateKey = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacSha256(dateKey, region);
  const serviceKey = hmacSha256(regionKey, service);
  return hmacSha256(serviceKey, "aws4_request");
}

export type CanonicalRequestInput = {
  method: string;
  path: string;
  queryParams?: Array<[string, string]>;
  /** Lowercase header names → trimmed values. Must already be sorted use-case; sorted here. */
  headers: Record<string, string>;
  /** Hex SHA-256 of the payload, or "UNSIGNED-PAYLOAD" for S3 streaming/presigned flows. */
  payloadHash: string;
};

export function buildCanonicalRequest(input: CanonicalRequestInput): {
  canonicalRequest: string;
  signedHeaders: string;
} {
  const names = Object.keys(input.headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${input.headers[name].trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    input.method.toUpperCase(),
    uriEncodePath(input.path),
    canonicalQueryString(input.queryParams ?? []),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  return { canonicalRequest, signedHeaders };
}

function credentialScope(dateStamp: string, region: string, service: string): string {
  return `${dateStamp}/${region}/${service}/aws4_request`;
}

export type SignInput = {
  method: string;
  host: string;
  path: string;
  queryParams?: Array<[string, string]>;
  headers: Record<string, string>;
  payloadHash: string;
  credentials: SigCredentials;
  region: string;
  service: string;
  now?: Date;
};

/** Signs a live request; returns the value for the Authorization header. */
export function signAuthorization(input: SignInput): { authorization: string; amzDate: string } {
  const { amzDate, dateStamp } = amzTimestamp(input.now);
  const headers = { ...input.headers, host: input.host, "x-amz-date": amzDate };
  const { canonicalRequest, signedHeaders } = buildCanonicalRequest({
    method: input.method,
    path: input.path,
    queryParams: input.queryParams,
    headers,
    payloadHash: input.payloadHash,
  });
  const scope = credentialScope(dateStamp, input.region, input.service);
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmacSha256(
    deriveSigningKey(input.credentials.secretAccessKey, dateStamp, input.region, input.service),
    stringToSign,
  ).toString("hex");
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    amzDate,
  };
}

export type PresignInput = {
  method: string;
  host: string;
  path: string;
  credentials: SigCredentials;
  region: string;
  service: string;
  expiresInSeconds: number;
  now?: Date;
};

/** Presigned URL (query-string auth, e.g. S3 GET). Expiry capped at 7 days (SigV4 limit for IAM credentials). */
export function presignUrl(input: PresignInput): string {
  if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds <= 0) {
    throw new Error("expiresInSeconds must be a positive integer.");
  }
  if (input.expiresInSeconds > 7 * 24 * 3600) {
    throw new Error("expiresInSeconds exceeds the 7-day SigV4 presigned-URL limit.");
  }
  const { amzDate, dateStamp } = amzTimestamp(input.now);
  const scope = credentialScope(dateStamp, input.region, input.service);
  const queryParams: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${input.credentials.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(input.expiresInSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const { canonicalRequest } = buildCanonicalRequest({
    method: input.method,
    path: input.path,
    queryParams,
    headers: { host: input.host },
    payloadHash: "UNSIGNED-PAYLOAD",
  });
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmacSha256(
    deriveSigningKey(input.credentials.secretAccessKey, dateStamp, input.region, input.service),
    stringToSign,
  ).toString("hex");
  const query = [...queryParams, ["X-Amz-Signature", signature] as [string, string]]
    .map(([name, value]) => `${uriEncode(name)}=${uriEncode(value)}`)
    .sort()
    .join("&");
  return `https://${input.host}${uriEncodePath(input.path)}?${query}`;
}

export type PresignedPostInput = {
  bucket: string;
  region: string;
  key: string;
  contentType: string;
  minBytes: number;
  maxBytes: number;
  credentials: SigCredentials;
  expiresInSeconds: number;
  now?: Date;
};

export type PresignedPost = {
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
};

/**
 * Browser upload via POST policy. The policy pins the EXACT key, the EXACT
 * content type, and a content-length range, so S3 itself rejects anything
 * else — including oversized bodies (which a presigned PUT signature cannot
 * constrain, since Content-Length is not signable).
 */
export function createPresignedPost(input: PresignedPostInput): PresignedPost {
  if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds <= 0) {
    throw new Error("expiresInSeconds must be a positive integer.");
  }
  if (!Number.isInteger(input.minBytes) || !Number.isInteger(input.maxBytes) || input.minBytes < 0 || input.maxBytes < input.minBytes) {
    throw new Error("Invalid byte range for presigned POST policy.");
  }
  const { amzDate, dateStamp } = amzTimestamp(input.now);
  const scope = credentialScope(dateStamp, input.region, "s3");
  const expiration = new Date((input.now ?? new Date()).getTime() + input.expiresInSeconds * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const policy = {
    expiration,
    conditions: [
      { bucket: input.bucket },
      { key: input.key },
      { "Content-Type": input.contentType },
      ["content-length-range", input.minBytes, input.maxBytes],
      { "x-amz-algorithm": "AWS4-HMAC-SHA256" },
      { "x-amz-credential": `${input.credentials.accessKeyId}/${scope}` },
      { "x-amz-date": amzDate },
    ],
  };
  const policyBase64 = Buffer.from(JSON.stringify(policy), "utf8").toString("base64");
  const signature = hmacSha256(
    deriveSigningKey(input.credentials.secretAccessKey, dateStamp, input.region, "s3"),
    policyBase64,
  ).toString("hex");
  return {
    url: `https://${input.bucket}.s3.${input.region}.amazonaws.com/`,
    fields: {
      key: input.key,
      "Content-Type": input.contentType,
      policy: policyBase64,
      "x-amz-algorithm": "AWS4-HMAC-SHA256",
      "x-amz-credential": `${input.credentials.accessKeyId}/${scope}`,
      "x-amz-date": amzDate,
      "x-amz-signature": signature,
    },
    expiresAt: expiration,
  };
}
