import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed one-click unsubscribe tokens for order-email footers.
 * Pure functions taking the secret explicitly, so they are unit-testable
 * without env. Token format: base64url(payload).base64url(signature) where
 * payload is JSON { uid, exp } and signature is HMAC-SHA256 over the payload.
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year: footer links stay valid

function b64urlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export function signUnsubscribeToken(userId: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const payload = b64urlEncode(JSON.stringify({ uid: userId, exp: nowSeconds + TOKEN_TTL_SECONDS }));
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Returns the user id when the token is authentic and unexpired, else null. */
export function verifyUnsubscribeToken(
  token: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  let payloadBuf: Buffer;
  try {
    payloadBuf = b64urlDecode(payload);
    JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("base64url"));
  const supplied = Buffer.from(sig);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  const parsed = JSON.parse(payloadBuf.toString("utf8")) as { uid?: unknown; exp?: unknown };
  if (typeof parsed.uid !== "string" || typeof parsed.exp !== "number") return null;
  if (parsed.exp <= nowSeconds) return null;
  return parsed.uid;
}
