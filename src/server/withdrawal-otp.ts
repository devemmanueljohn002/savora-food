import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { db } from "./db";
import { ApiError } from "./errors";
import { sendEmail } from "./email";
import type { Owner } from "./wallet";

export const WITHDRAWAL_OTP_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/**
 * Salted OTP hash (`v1$salt$digest`) so a database leak does not yield the
 * 6-digit codes to offline brute force. Each code gets a fresh 128-bit salt.
 */
export function hashWithdrawalOtp(code: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = createHash("sha256").update(salt + code.trim()).digest("hex");
  return `v1$${salt}$${digest}`;
}

/** Timing-safe OTP verification. Accepts current salted hashes and legacy
 *  unsalted sha256 rows (transitional); stored plaintext is never accepted. */
export function verifyWithdrawalOtpHash(stored: string, code: string): boolean {
  const clean = code.trim();
  const parts = stored.split("$");
  let candidate: string;
  if (parts.length === 3 && parts[0] === "v1" && /^[0-9a-f]{32}$/.test(parts[1])) {
    candidate = createHash("sha256").update(parts[1] + clean).digest("hex");
    return timingSafeEqualHex(candidate, parts[2]);
  }
  if (/^[0-9a-f]{64}$/.test(stored)) {
    candidate = createHash("sha256").update(clean).digest("hex");
    return timingSafeEqualHex(candidate, stored);
  }
  return false;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Pure 6-digit code generator (unit-testable format contract). */
export function generateWithdrawalOtpCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

async function ownerEmail(owner: Owner, userId: string | null): Promise<string | null> {
  const sql = db();
  if (userId) {
    const rows = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${userId} LIMIT 1`;
    if (rows[0]?.email) return rows[0].email;
  }
  // Fallback: profile-level email columns (vendors keep one).
  if (owner.type === "VENDOR") {
    const rows = await sql<{ email: string | null; user_id: string }[]>`
      SELECT email, user_id::text AS user_id FROM vendors WHERE id = ${owner.id} LIMIT 1
    `;
    if (rows[0]?.email) return rows[0].email;
    if (rows[0]?.user_id) {
      const users = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${rows[0].user_id} LIMIT 1`;
      return users[0]?.email ?? null;
    }
  } else if (owner.type === "AFFILIATE") {
    const rows = await sql<{ email: string | null; user_id: string }[]>`
      SELECT email, user_id::text AS user_id FROM affiliates WHERE id = ${owner.id} LIMIT 1
    `;
    if (rows[0]?.email) return rows[0].email;
    if (rows[0]?.user_id) {
      const users = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${rows[0].user_id} LIMIT 1`;
      return users[0]?.email ?? null;
    }
  } else {
    const rows = await sql<{ user_id: string }[]>`
      SELECT user_id::text AS user_id FROM delivery_partners WHERE id = ${owner.id} LIMIT 1
    `;
    if (rows[0]?.user_id) {
      const users = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${rows[0].user_id} LIMIT 1`;
      return users[0]?.email ?? null;
    }
  }
  return null;
}

/**
 * Issue a withdrawal OTP to the owner's email. Rate-limited: at most one
 * live code per owner (previous live codes are consumed on re-issue).
 * In dev without an email provider, sendEmail logs to console — the code is
 * still required on the withdrawal POST.
 */
export async function requestWithdrawalOtp(owner: Owner, userId: string | null): Promise<{ expiresAt: Date }> {
  const sql = db();
  const email = await ownerEmail(owner, userId);
  if (!email) throw ApiError.notFound("No email address found for this account.");

  const code = generateWithdrawalOtpCode();
  const expiresAt = new Date(Date.now() + WITHDRAWAL_OTP_MINUTES * 60_000);

  await sql`
    UPDATE withdrawal_otps SET consumed_at = NOW()
    WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} AND consumed_at IS NULL
  `;
  await sql`
    INSERT INTO withdrawal_otps (owner_type, owner_id, code_hash, expires_at)
    VALUES (${owner.type}, ${owner.id}, ${hashWithdrawalOtp(code)}, ${expiresAt.toISOString()})
  `;

  const subject = owner.type === "RIDER" ? "Your rider withdrawal code" : "Your vendor withdrawal code";
  await sendEmail({
    to: email,
    subject: `Savora Food — ${subject}`,
    text: `Your Savora Food withdrawal code is ${code}. It expires in ${WITHDRAWAL_OTP_MINUTES} minutes. If you did not request a withdrawal, ignore this email.`,
  });
  return { expiresAt };
}

/**
 * Verify + single-use consume an OTP. Throws on expired/unknown/too-many-tries.
 * Must be called inside the withdrawal flow BEFORE funds are debited.
 *
 * Race-safe: every attempt is counted exactly once via an atomic increment,
 * and consumption succeeds for exactly one concurrent caller
 * (WHERE consumed_at IS NULL + row-count check).
 */
export async function verifyWithdrawalOtp(owner: Owner, code: string): Promise<void> {
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) throw ApiError.validation("Enter the 6-digit code sent to your email.");
  const sql = db();
  const rows = await sql<{ id: string; code_hash: string; expires_at: Date; attempts: number }[]>`
    SELECT id, code_hash, expires_at, attempts FROM withdrawal_otps
    WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
      AND consumed_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw ApiError.validation("Code expired or not found. Request a new code.");

  // Count this attempt atomically. Parallel attempts each increment exactly
  // once, so the cap cannot be dodged by racing.
  const bumped = await sql<{ attempts: number }[]>`
    UPDATE withdrawal_otps SET attempts = attempts + 1
    WHERE id = ${row.id} AND consumed_at IS NULL
    RETURNING attempts
  `;
  if (bumped.length === 0) throw ApiError.validation("Code expired or not found. Request a new code.");
  if (bumped[0].attempts > MAX_ATTEMPTS) {
    await sql`UPDATE withdrawal_otps SET consumed_at = NOW() WHERE id = ${row.id}`;
    throw ApiError.validation("Too many wrong attempts. Request a new code.");
  }
  if (!verifyWithdrawalOtpHash(row.code_hash, clean)) {
    throw ApiError.validation("Incorrect code. Check your email and try again.");
  }
  const consumed = await sql<{ id: string }[]>`
    UPDATE withdrawal_otps SET consumed_at = NOW()
    WHERE id = ${row.id} AND consumed_at IS NULL
    RETURNING id
  `;
  if (consumed.length === 0) throw ApiError.validation("Code expired or not found. Request a new code.");
}
