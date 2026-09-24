import { db } from "../db";

export type UserRow = {
  id: string;
  email: string;
  phone: string | null;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  status: string;
  email_verified_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
};

type UserWithSession = UserRow & {
  session_id: string;
  session_created_at: Date;
  session_expires_at: Date;
};

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await db()<UserRow[]>`SELECT * FROM users WHERE email = lower(${email}) LIMIT 1`;
  return rows[0];
}

export async function getUserById(id: string): Promise<UserRow | undefined> {
  const rows = await db()<UserRow[]>`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0];
}

export async function getUserByEmailOrPhone(identifier: string): Promise<UserRow | undefined> {
  const rows = await db()<UserRow[]>`
    SELECT * FROM users WHERE email = lower(${identifier}) OR phone = ${identifier} LIMIT 1
  `;
  return rows[0];
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: string;
}): Promise<UserRow> {
  const rows = await db()<UserRow[]>`
    INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
    VALUES (
      ${input.email.toLowerCase()},
      ${input.passwordHash},
      ${input.firstName ?? ""},
      ${input.lastName ?? ""},
      ${input.phone ?? null},
      ${input.role ?? "CUSTOMER"}
    )
    RETURNING *
  `;
  return rows[0];
}

export async function touchLastLogin(userId: string): Promise<void> {
  await db()`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = ${userId}`;
}

export async function createVendorProfile(input: {
  userId: string;
  businessName: string;
  ownerName: string;
  phone?: string;
  email?: string;
}): Promise<void> {
  const base =
    input.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kitchen";
  let slug = base;
  let n = 2;
  while ((await db()<{ id: string }[]>`SELECT id FROM vendors WHERE slug = ${slug} LIMIT 1`)[0]) {
    slug = `${base}-${n++}`;
  }
  await db()`
    INSERT INTO vendors (user_id, business_name, slug, owner_name, phone, email, status)
    VALUES (
      ${input.userId},
      ${input.businessName},
      ${slug},
      ${input.ownerName},
      ${input.phone ?? null},
      ${input.email ?? null},
      'PENDING'
    )
  `;
}

export async function createDeliveryPartnerProfile(input: {
  userId: string;
  name: string;
  phone?: string;
}): Promise<void> {
  await db()`
    INSERT INTO delivery_partners (user_id, name, phone, status)
    VALUES (${input.userId}, ${input.name}, ${input.phone ?? null}, 'ACTIVE')
  `;
}

export async function updatePassword(userId: string, passwordHash: string): Promise<void> {
  await db()`UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW() WHERE id = ${userId}`;
}

export async function createSession(input: {
  userId: string;
  refreshTokenHash: string;
  userAgent?: string;
  ipAddress?: string;
  refreshTokenTtlDays: number;
}): Promise<{ id: string; expires_at: Date }> {
  const rows = await db()<{ id: string; expires_at: Date }[]>`
    INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
    VALUES (
      ${input.userId},
      ${input.refreshTokenHash},
      ${input.userAgent ?? null},
      ${input.ipAddress ?? null},
      NOW() + make_interval(days => ${input.refreshTokenTtlDays})
    )
    RETURNING id, expires_at
  `;
  return rows[0];
}

export async function getSessionByRefreshHash(refreshTokenHash: string): Promise<(UserRow & { session_id: string }) | undefined> {
  const rows = await db()<UserWithSession[]>`
    SELECT
      u.id, u.email, u.phone, u.password_hash, u.first_name, u.last_name,
      u.role, u.status, u.email_verified_at, u.last_login_at, u.created_at,
      s.id AS session_id, s.created_at AS session_created_at, s.expires_at AS session_expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.refresh_token_hash = ${refreshTokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    password_hash: row.password_hash,
    first_name: row.first_name,
    last_name: row.last_name,
    role: row.role,
    status: row.status,
    email_verified_at: row.email_verified_at,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    session_id: row.session_id,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db()`UPDATE sessions SET revoked_at = NOW() WHERE id = ${sessionId}`;
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db()`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
}

export async function createPasswordResetToken(input: {
  userId: string;
  tokenHash: string;
  expiresHours: number;
}): Promise<void> {
  await db()`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${input.userId}, ${input.tokenHash}, NOW() + make_interval(hours => ${input.expiresHours}))
  `;
}

type ResetTokenRow = {
  prt_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
};

/**
 * Claims a valid, unused, unexpired reset token and returns the owning user.
 * Multiple concurrent claims are safe: used_at acts as the lock.
 */
export async function consumePasswordResetToken(tokenHash: string): Promise<UserRow | undefined> {
  const rows = await db()<ResetTokenRow[]>`
    SELECT id AS prt_id, user_id, token_hash, expires_at, used_at
    FROM password_reset_tokens
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return undefined;

  const claimed = await db()<{ id: string }[]>`
    UPDATE password_reset_tokens SET used_at = NOW()
    WHERE id = ${row.prt_id} AND used_at IS NULL
    RETURNING id
  `;
  if (!claimed[0]) return undefined;

  const userRows = await db()<UserRow[]>`SELECT * FROM users WHERE id = ${row.user_id} LIMIT 1`;
  return userRows[0];
}

// ── Email verification ────────────────────────────────────────────────────────

export async function createEmailVerificationToken(input: {
  userId: string;
  tokenHash: string;
  expiresHours: number;
}): Promise<void> {
  await db()`
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
    VALUES (${input.userId}, ${input.tokenHash}, NOW() + make_interval(hours => ${input.expiresHours}))
  `;
}

export async function markEmailVerified(userId: string): Promise<UserRow | undefined> {
  const rows = await db()<UserRow[]>`
    UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return rows[0];
}

type EmailVerificationRow = {
  evt_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
};

/**
 * Claims a valid, unused, unexpired email-verification token. `used_at` acts as
 * the lock so concurrent clicks cannot double-claim.
 */
export async function consumeEmailVerificationToken(tokenHash: string): Promise<UserRow | undefined> {
  const rows = await db()<EmailVerificationRow[]>`
    SELECT id AS evt_id, user_id, token_hash, expires_at, used_at
    FROM email_verification_tokens
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return undefined;

  const claimed = await db()<{ id: string }[]>`
    UPDATE email_verification_tokens SET used_at = NOW()
    WHERE id = ${row.evt_id} AND used_at IS NULL
    RETURNING id
  `;
  if (!claimed[0]) return undefined;

  const userRows = await db()<UserRow[]>`SELECT * FROM users WHERE id = ${row.user_id} LIMIT 1`;
  return userRows[0];
}

// ── Profile management ────────────────────────────────────────────────────────

export async function updateUserProfile(
  userId: string,
  input: { firstName?: string; lastName?: string; phone?: string },
): Promise<UserRow | undefined> {
  const rows = await db()<UserRow[]>`
    UPDATE users
    SET first_name = COALESCE(${input.firstName ?? null}, first_name),
        last_name = COALESCE(${input.lastName ?? null}, last_name),
        phone = COALESCE(${input.phone ?? null}, phone),
        updated_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return rows[0];
}

// ── Vendor onboarding ─────────────────────────────────────────────────────────

export type VendorRow = {
  id: string;
  user_id: string;
  business_name: string;
  slug: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  banner_image_url: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  status: string;
  commission_rate: string | null;
  rating_average: string | null;
  rating_count: number | null;
  is_featured: boolean | null;
  created_at: Date;
};

export async function getVendorByUserId(userId: string): Promise<VendorRow | undefined> {
  const rows = await db()<VendorRow[]>`SELECT * FROM vendors WHERE user_id = ${userId} LIMIT 1`;
  return rows[0];
}

export async function updateVendorProfile(userId: string, input: {
  businessName?: string;
  ownerName?: string;
  phone?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
}): Promise<VendorRow | undefined> {
  const rows = await db()<VendorRow[]>`
    UPDATE vendors
    SET business_name = COALESCE(${input.businessName ?? null}, business_name),
        owner_name = COALESCE(${input.ownerName ?? null}, owner_name),
        phone = COALESCE(${input.phone ?? null}, phone),
        description = COALESCE(${input.description ?? null}, description),
        address = COALESCE(${input.address ?? null}, address),
        city = COALESCE(${input.city ?? null}, city),
        state = COALESCE(${input.state ?? null}, state),
        updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING *
  `;
  return rows[0];
}