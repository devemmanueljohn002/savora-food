import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

/**
 * Password hashing via Node's built-in scrypt (no native addon), so hashing and
 * verification behave identically under plain Node, tsx and Next.js's bundler.
 * Format: scrypt$N$r$p$salt$digest
 */
export function hashPassword(plainPassword: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  return deriveKey(plainPassword, salt, N, R, P).then(
    (key) => `scrypt$${N}$${R}$${P}$${salt}$${key.toString("base64url")}`,
  );
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  try {
    const parts = passwordHash.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, nStr, rStr, pStr, salt, digestB64] = parts;
    const n = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || n < 2) return false;

    const expected = Buffer.from(digestB64, "base64url");
    if (expected.length !== KEYLEN) return false;

    const actual = await deriveKey(plainPassword, salt, n, r, p);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function deriveKey(
  plainPassword: string,
  salt: string,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return Buffer.from(await scrypt(plainPassword, salt, KEYLEN, { N: n, r, p }));
}