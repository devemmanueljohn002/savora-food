import { getEnv } from "../env";
import { presignUrl, sha256Hex, signAuthorization, type SigCredentials } from "./sigv4";

/**
 * Minimal S3 REST client over fetch (no AWS SDK dependency).
 *
 * Only the operations the profile-photo flow needs: HEAD (existence/size),
 * GET (download for validation), PUT (sanitized copy), DELETE (replacement
 * and orphan cleanup), plus presigned GET URLs for authorized viewing.
 * Requests are signed with SigV4 Authorization headers; unsigned payload is
 * used for bodiless requests per the AWS docs.
 */

export type S3Config = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Null when photo storage is not configured — routes must fail closed (503). */
export function s3ConfigFromEnv(): S3Config | null {
  const env = getEnv();
  if (!env.s3Bucket || !env.s3AccessKeyId || !env.s3SecretAccessKey) return null;
  return {
    bucket: env.s3Bucket,
    region: env.s3Region,
    accessKeyId: env.s3AccessKeyId,
    secretAccessKey: env.s3SecretAccessKey,
  };
}

export function requireS3Config(): S3Config {
  const config = s3ConfigFromEnv();
  if (!config) {
    throw new Error(
      "Profile photo storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.",
    );
  }
  return config;
}

export function s3Host(bucket: string, region: string): string {
  return `${bucket}.s3.${region}.amazonaws.com`;
}

function credentialsOf(config: S3Config): SigCredentials {
  return { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey };
}

type SignedFetchInput = {
  method: "HEAD" | "GET" | "PUT" | "DELETE";
  key: string;
  body?: Buffer;
  contentType?: string;
  timeoutMs?: number;
};

async function s3Fetch(config: S3Config, input: SignedFetchInput): Promise<Response> {
  const host = s3Host(config.bucket, config.region);
  const path = `/${input.key}`;
  const payloadHash = input.body ? sha256Hex(input.body) : "UNSIGNED-PAYLOAD";
  const headers: Record<string, string> = { "x-amz-content-sha256": payloadHash };
  if (input.contentType) headers["content-type"] = input.contentType;
  const { authorization, amzDate } = signAuthorization({
    method: input.method,
    host,
    path,
    headers,
    payloadHash,
    credentials: credentialsOf(config),
    region: config.region,
    service: "s3",
  });
  return fetch(`https://${host}${path}`, {
    method: input.method,
    headers: {
      ...headers,
      "x-amz-date": amzDate,
      Authorization: authorization,
      ...(input.body ? { "Content-Length": String(input.body.byteLength) } : {}),
    },
    body: input.body as unknown as BodyInit | undefined,
    signal: AbortSignal.timeout(input.timeoutMs ?? 20000),
  });
}

export type HeadResult = { exists: boolean; sizeBytes?: number; contentType?: string };

/**
 * HEAD an object. Returns exists:false for BOTH 404 and 403: without
 * s3:ListBucket, S3 answers 403 for missing keys, so the two are
 * indistinguishable — and for our flows "cannot be read" == "unusable".
 */
export async function headObject(config: S3Config, key: string): Promise<HeadResult> {
  const res = await s3Fetch(config, { method: "HEAD", key });
  if (res.status === 404 || res.status === 403) return { exists: false };
  if (res.status !== 200) {
    throw new Error(`S3 HEAD failed (${res.status}).`);
  }
  const length = res.headers.get("content-length");
  return {
    exists: true,
    sizeBytes: length === null ? undefined : Number(length),
    contentType: res.headers.get("content-type") ?? undefined,
  };
}

export async function getObjectBuffer(
  config: S3Config,
  key: string,
): Promise<{ buffer: Buffer; contentType: string; sizeBytes: number }> {
  const res = await s3Fetch(config, { method: "GET", key });
  if (res.status === 404 || res.status === 403) {
    const error = new Error("S3 object not found.") as Error & { code?: string };
    error.code = "S3_NOT_FOUND";
    throw error;
  }
  if (res.status !== 200) {
    throw new Error(`S3 GET failed (${res.status}).`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    sizeBytes: buffer.byteLength,
  };
}

export async function putObjectBuffer(
  config: S3Config,
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const res = await s3Fetch(config, { method: "PUT", key, body: buffer, contentType });
  if (res.status !== 200) {
    throw new Error(`S3 PUT failed (${res.status}).`);
  }
}

/**
 * Idempotent delete: 2xx/404 mean "gone". Anything else throws so cleanup
 * failures are recorded, never silently dropped.
 */
export async function deleteObject(config: S3Config, key: string): Promise<void> {
  const res = await s3Fetch(config, { method: "DELETE", key });
  if (res.status === 404) return;
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`S3 DELETE failed (${res.status}).`);
  }
}

/** Short-lived presigned GET for an authorized viewer. Never logged, never stored. */
export function presignedGetUrl(config: S3Config, key: string, expiresInSeconds: number): string {
  return presignUrl({
    method: "GET",
    host: s3Host(config.bucket, config.region),
    path: `/${key}`,
    credentials: credentialsOf(config),
    region: config.region,
    service: "s3",
    expiresInSeconds,
  });
}
