import { createHash, randomInt } from "crypto";
import { db } from "./db";
import { ApiError } from "./errors";
import { sendEmail } from "./email";
import type { Owner } from "./wallet";

export const WITHDRAWAL_OTP_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export function hashWithdrawalOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
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
  if (row.attempts >= MAX_ATTEMPTS) {
    await sql`UPDATE withdrawal_otps SET consumed_at = NOW() WHERE id = ${row.id}`;
    throw ApiError.validation("Too many wrong attempts. Request a new code.");
  }
  const match =
    row.code_hash === hashWithdrawalOtp(clean) ||
    // Legacy plain codes (if any were stored before hashing): accept once, then consume.
    (row.code_hash as string) === clean;
  if (!match) {
    await sql`UPDATE withdrawal_otps SET attempts = attempts + 1 WHERE id = ${row.id}`;
    throw ApiError.validation("Incorrect code. Check your email and try again.");
  }
  await sql`UPDATE withdrawal_otps SET consumed_at = NOW() WHERE id = ${row.id}`;
}
