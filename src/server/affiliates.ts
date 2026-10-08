import { randomBytes } from "crypto";
import { db } from "./db";
import { ApiError } from "./errors";
import { getEnv } from "./env";
import { getPayoutSettings } from "./money";
import { savePayoutAccount } from "./payouts";
import type { Owner } from "./wallet";

/**
 * Affiliate marketers: referral codes/links, attribution, and commission.
 *
 * Money rules (all CONFIGURABLE via payout_config):
 * - Commission = PERCENT of the commissionable base (default 5%) OR a FLAT
 *   kobo amount per qualifying order.
 * - Commissionable base default: item SUBTOTAL only, delivery fee excluded,
 *   discounts subtracted (i.e. subtotal − discount). Tell the operator this
 *   default so they can confirm it.
 * - Attribution: the referrer is saved on the user ONCE at signup (never
 *   changed afterwards). Checkout only attaches the saved referrer — an
 *   existing account opening /ref/[code] is never attached, and foreign
 *   codes/cookies are ignored. 30-day referral cookie (last click wins).
 * - One commission per order (UNIQUE order_id + ON CONFLICT DO NOTHING).
 * - Commission is created only when the order reaches DELIVERED (delivery
 *   verified) — never at signup or order placement — as a PENDING ledger
 *   hold maturing via releaseAffiliateHolds (affiliate_hold_days grace).
 *   Cancel/refund/chargeback inserts an offsetting adjustment and marks
 *   REVERSED.
 * - Self-referral blocked by user id AND phone number at signup/checkout,
 *   plus shared device (login IP + user agent) and shared payout account
 *   at commission time.
 */

export const AFFILIATE_COOKIE = "savora_aff";

export type AffiliateStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

export type AffiliateRow = {
  id: string;
  user_id: string;
  code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: AffiliateStatus;
  status_reason: string | null;
  recipient_code: string | null;
  bank_code: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  payout_account_changed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CommissionRow = {
  id: string;
  affiliate_id: string;
  order_id: string;
  base_kobo: number | string;
  amount_kobo: number | string;
  mode: "PERCENT" | "FLAT";
  rate_snapshot: unknown;
  status: "PENDING" | "RELEASED" | "REVERSED";
  created_at: Date;
};

export type CommissionConfig = {
  mode: "PERCENT" | "FLAT";
  pct: number;
  flatKobo: number;
  excludesDeliveryFee: boolean;
  subtractsDiscount: boolean;
  attributionDays: number;
  holdDays: number;
};

export const DEFAULT_COMMISSION_CONFIG: CommissionConfig = {
  mode: "PERCENT",
  pct: 5,
  flatKobo: 0,
  excludesDeliveryFee: true,
  subtractsDiscount: true,
  attributionDays: 7,
  holdDays: 0,
};

export async function getCommissionConfig(): Promise<CommissionConfig> {
  let settings: Record<string, unknown> = {};
  try {
    settings = await getPayoutSettings();
  } catch {
    settings = {};
  }
  const num = (key: string, fallback: number): number => {
    const raw = settings[key];
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : fallback;
  };
  const mode = settings["affiliate_commission_mode"] === "FLAT" ? "FLAT" : "PERCENT";
  return {
    mode,
    pct: Math.min(num("affiliate_commission_pct", DEFAULT_COMMISSION_CONFIG.pct), 100),
    flatKobo: Math.round(num("affiliate_commission_flat_kobo", 0)),
    excludesDeliveryFee: settings["affiliate_base_excludes_delivery_fee"] !== false,
    subtractsDiscount: settings["affiliate_base_subtracts_discount"] !== false,
    attributionDays: Math.max(1, Math.round(num("affiliate_attribution_days", 7))),
    holdDays: Math.max(0, Math.round(num("affiliate_hold_days", 0))),
  };
}

/**
 * Pure commission math (unit-testable): base is item subtotal minus
 * discounts (delivery fee / tax / service fee never included — they are not
 * part of the subtotal). Example: ₦6,000 order at 5% = ₦300.
 */
export function computeCommissionKobo(
  order: { subtotalNaira: number; discountNaira: number },
  config: CommissionConfig,
): { baseKobo: number; amountKobo: number } {
  const subtotalKobo = Math.max(0, Math.round(order.subtotalNaira * 100));
  const discountKobo = config.subtractsDiscount ? Math.max(0, Math.round(order.discountNaira * 100)) : 0;
  const baseKobo = Math.max(0, subtotalKobo - discountKobo);
  const amountKobo =
    config.mode === "FLAT" ? Math.max(0, config.flatKobo) : Math.round((baseKobo * config.pct) / 100);
  return { baseKobo, amountKobo };
}

/** Pure precedence: checkout code > cookie. Empty values are ignored. */
export function resolveAttributionCode(checkoutCode: string | null | undefined, cookieCode: string | null | undefined): string | null {
  const checkout = (checkoutCode ?? "").trim().toUpperCase();
  if (checkout) return checkout;
  const cookie = (cookieCode ?? "").trim().toUpperCase();
  return cookie || null;
}

/**
 * Pure: checkout attaches ONLY the referrer saved at signup — never
 * re-attributes. No saved referrer (existing accounts) → null. A wanted
 * code that differs from the saved one (foreign typed code or another
 * affiliate's cookie) → null.
 */
export function resolveCheckoutReferrer(
  savedCode: string | null | undefined,
  wantedCode: string | null | undefined,
): string | null {
  if (!savedCode) return null;
  if (!wantedCode || wantedCode === savedCode) return savedCode;
  return null;
}

/** Referral codes: uppercase letters/digits, 4–16 chars. */
export function normalizeReferralCode(code: string): string {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length < 4 || clean.length > 16) {
    throw ApiError.validation("Enter a valid referral code.");
  }
  return clean;
}

function codeFromName(fullName: string): string {
  const letters = fullName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "AFF";
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `${letters}${suffix}`.slice(0, 16);
}

/** Normalize a phone number for self-referral comparison (digits, drop NG trunk/country prefix). */
export function normalizePhoneForCompare(phone: string | null | undefined): string {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("234")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function isSelfReferral(input: {
  affiliateUserId: string;
  affiliatePhone: string | null | undefined;
  orderUserId: string;
  orderPhone: string | null | undefined;
}): boolean {
  if (input.affiliateUserId === input.orderUserId) return true;
  const a = normalizePhoneForCompare(input.affiliatePhone);
  const b = normalizePhoneForCompare(input.orderPhone);
  return a.length >= 7 && a === b;
}

export function referralLinkFor(code: string): string {
  const base = getEnv().siteUrl ?? getEnv().appUrl;
  return `${base.replace(/\/+$/, "")}/ref/${code}`;
}

/** The referrer saved on the user at signup (set-once, never changed). */
export async function getReferredAffiliate(
  userId: string,
): Promise<{ id: string; code: string } | null> {
  const sql = db();
  const rows = await sql<{ id: string; code: string }[]>`
    SELECT a.id::text AS id, a.code FROM affiliates a
    JOIN users u ON u.referred_by_affiliate_id = a.id
    WHERE u.id = ${userId} AND a.status = 'ACTIVE' LIMIT 1
  `;
  return rows[0] ? { id: rows[0].id, code: rows[0].code } : null;
}

/**
 * Resolve a signup-time referral code to an affiliate id, or null when it
 * must not be saved: unknown/inactive code, or the same phone number as the
 * affiliate (self-referral). Never throws — signup always succeeds.
 */
export async function resolveSignupReferrer(
  code: string | null | undefined,
  phone: string | null | undefined,
  email?: string | null | undefined,
): Promise<string | null> {
  const clean = (code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean) return null;
  const affiliate = await getAffiliateByCode(clean).catch(() => undefined);
  if (!affiliate || affiliate.status !== "ACTIVE") return null;
  if (
    isSelfReferral({
      affiliateUserId: affiliate.user_id,
      affiliatePhone: affiliate.phone,
      orderUserId: "",
      orderPhone: phone ?? null,
    })
  ) {
    return null;
  }
  // Email leg (covers phoneless Google signups): the affiliate owner's login
  // email matching the new signup's verified email means same human.
  const signupEmail = (email ?? "").trim().toLowerCase();
  if (signupEmail) {
    const sql = db();
    const owners = await sql<{ email: string | null }[]>`
      SELECT email FROM users WHERE id = ${affiliate.user_id} LIMIT 1
    `.catch(() => []);
    if ((owners[0]?.email ?? "").trim().toLowerCase() === signupEmail) return null;
  }
  return affiliate.id;
}

export async function getAffiliateByUserId(userId: string): Promise<AffiliateRow | undefined> {
  const rows = await db()<AffiliateRow[]>`SELECT * FROM affiliates WHERE user_id = ${userId} LIMIT 1`;
  return rows[0];
}

export async function getAffiliateByCode(code: string): Promise<AffiliateRow | undefined> {
  const clean = code.trim().toUpperCase();
  if (!clean) return undefined;
  const rows = await db()<AffiliateRow[]>`SELECT * FROM affiliates WHERE code = ${clean} LIMIT 1`;
  return rows[0];
}

export async function requireAffiliate(userId: string): Promise<AffiliateRow> {
  const affiliate = await getAffiliateByUserId(userId);
  if (!affiliate) throw ApiError.notFound("No affiliate profile found. Join the affiliate program first.");
  if (affiliate.status !== "ACTIVE") {
    throw ApiError.forbidden(
      affiliate.status_reason
        ? `Your affiliate account is ${affiliate.status.toLowerCase()}: ${affiliate.status_reason}`
        : `Your affiliate account is ${affiliate.status.toLowerCase()}. Contact support.`,
    );
  }
  return affiliate;
}

/**
 * "Become an Affiliate": any signed-in user, one profile each. Bank details
 * go through the SAME Paystack verify + recipient flow as vendors/riders
 * (server-side only). The profile is kept even if bank verification fails —
 * the user can add the bank later from the affiliate dashboard.
 */
export async function registerAffiliate(
  userId: string,
  input: { fullName: string; phone: string; accountNumber?: string | null; bankCode?: string | null },
): Promise<AffiliateRow> {
  const fullName = input.fullName.trim();
  if (fullName.length < 2) throw ApiError.validation("Enter your full name.");
  const phone = input.phone.trim();
  if (phone.replace(/\D/g, "").length < 7) throw ApiError.validation("Enter a valid phone number.");

  const existing = await getAffiliateByUserId(userId);
  if (existing) throw ApiError.conflict("You already have an affiliate profile.");

  const sql = db();
  const users = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${userId} LIMIT 1`;

  let code = codeFromName(fullName);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clash = await sql<{ id: string }[]>`SELECT id FROM affiliates WHERE code = ${code} LIMIT 1`;
    if (!clash[0]) break;
    code = codeFromName(`${fullName}${attempt}`);
  }

  const created = await sql<AffiliateRow[]>`
    INSERT INTO affiliates (user_id, code, full_name, phone, email)
    VALUES (${userId}, ${code}, ${fullName}, ${phone}, ${users[0]?.email ?? null})
    RETURNING *
  `;
  const affiliate = created[0];

  if (input.accountNumber && input.bankCode) {
    // Same verification + recipient creation as vendors/riders. Throws on
    // failure — the profile stays, the bank can be added later.
    await savePayoutAccount(
      { type: "AFFILIATE", id: affiliate.id },
      { accountNumber: input.accountNumber, bankCode: input.bankCode },
    );
    const refreshed = await sql<AffiliateRow[]>`SELECT * FROM affiliates WHERE id = ${affiliate.id} LIMIT 1`;
    return refreshed[0] ?? affiliate;
  }
  return affiliate;
}

/** Record a referral-link click (best-effort; never breaks the redirect). */
export async function recordClick(code: string, ip: string | null, userAgent: string | null): Promise<AffiliateRow | undefined> {
  const affiliate = await getAffiliateByCode(code);
  if (!affiliate || affiliate.status !== "ACTIVE") return undefined;
  const sql = db();
  // Click-fraud throttle: one counted click per affiliate + IP per hour.
  // Repeat hits still refresh the attribution cookie (route-level) but do
  // not inflate clicks or grow the table.
  const recent = ip
    ? await sql<{ found: string }[]>`
        SELECT 1 AS found FROM affiliate_clicks
        WHERE affiliate_id = ${affiliate.id} AND ip_address = ${ip}
          AND created_at > NOW() - make_interval(hours => 1)
        LIMIT 1
      `.catch(() => [])
    : [];
  if (recent.length === 0) {
    await sql`
      INSERT INTO affiliate_clicks (affiliate_id, code, ip_address, user_agent)
      VALUES (${affiliate.id}, ${affiliate.code}, ${ip}, ${userAgent})
    `.catch(() => undefined);
  }
  return affiliate;
}

/**
 * Stamp attribution onto freshly created checkout orders (pre-payment).
 * The commission row itself is only created once the order is PAID
 * (confirmAffiliateCommission), so unpaid checkouts never earn anything.
 */
export async function attachAffiliateToOrders(input: {
  orderIds: string[];
  userId: string;
  code: string | null;
}): Promise<AffiliateRow | null> {
  if (input.orderIds.length === 0 || !input.code) return null;
  const affiliate = await getAffiliateByCode(input.code);
  if (!affiliate || affiliate.status !== "ACTIVE") return null;

  const sql = db();
  const users = await sql<{ phone: string | null }[]>`SELECT phone FROM users WHERE id = ${input.userId} LIMIT 1`;
  if (
    isSelfReferral({
      affiliateUserId: affiliate.user_id,
      affiliatePhone: affiliate.phone,
      orderUserId: input.userId,
      orderPhone: users[0]?.phone ?? null,
    })
  ) {
    throw ApiError.validation("You cannot use your own referral code.");
  }
  // Defense in depth (the route layer also gates on the saved referrer):
  // only the signup-saved referrer may stamp, never a foreign code, and an
  // already-attributed order is never re-stamped.
  const saved = await getReferredAffiliate(input.userId).catch(() => null);
  if (!saved || saved.code !== affiliate.code) return null;
  if (
    await hasSharedDeviceOrPayout({
      affiliateUserId: affiliate.user_id,
      affiliateBankAccount: affiliate.bank_account_number,
      orderUserId: input.userId,
    }).catch(() => false)
  ) {
    return null;
  }
  await sql`
    UPDATE orders
    SET affiliate_code = ${affiliate.code}, affiliate_id = ${affiliate.id}
    WHERE id = ANY(${sql.array(input.orderIds)}::uuid[]) AND user_id = ${input.userId}
      AND (affiliate_id IS NULL OR affiliate_id = ${affiliate.id})
  `;
  return affiliate;
}

/**
 * Shared device / payout-account signals that the referrer and the customer
 * are the same person. Compares the most recent login fingerprint (IP +
 * user agent) of both users, and whether the customer also holds an
 * affiliate profile on the referrer's payout account number.
 */
async function hasSharedDeviceOrPayout(input: {
  affiliateUserId: string;
  affiliateBankAccount: string | null;
  orderUserId: string;
}): Promise<boolean> {
  const sql = db();
  // Only recent sessions count: stale logins must not permanently taint a
  // user, and exact IP+UA matches on shared networks are already narrow.
  const sessions = await sql<{ user_id: string; ip_address: string | null; user_agent: string | null }[]>`
    SELECT DISTINCT ON (user_id) user_id::text AS user_id, ip_address, user_agent
    FROM sessions
    WHERE user_id = ANY(${sql.array([input.affiliateUserId, input.orderUserId])}::uuid[])
      AND revoked_at IS NULL
      AND created_at > NOW() - make_interval(days => 30)
    ORDER BY user_id, created_at DESC
  `;
  if (sessions.length === 2) {
    const norm = (value: string | null) => (value ?? "").trim().toLowerCase();
    const [first, second] = sessions;
    if (
      norm(first.ip_address) &&
      norm(first.ip_address) === norm(second.ip_address) &&
      norm(first.user_agent) &&
      norm(first.user_agent) === norm(second.user_agent)
    ) {
      return true;
    }
  }
  const account = (input.affiliateBankAccount ?? "").replace(/\D/g, "");
  if (account.length >= 10) {
    const shared = await sql<{ found: string }[]>`
      SELECT 1 AS found FROM affiliates
      WHERE user_id = ${input.orderUserId}
        AND NULLIF(regexp_replace(COALESCE(bank_account_number, ''), '\\D', '', 'g'), '') = ${account}
      LIMIT 1
    `;
    if (shared.length > 0) return true;
  }
  return false;
}

/**
 * Create the PENDING commission (ledger hold) once the order reaches
 * DELIVERED (delivery verified). Never runs at signup or order placement:
 * non-delivered orders return null without writing anything. Holds mature
 * into available balance via releaseAffiliateHolds() honoring the
 * affiliate_hold_days grace period (default 0 = releasable on the first
 * balance read after delivery). Idempotent: UNIQUE(order_id) +
 * ON CONFLICT DO NOTHING. Best-effort: callers must never fail delivery
 * confirmation on ledger errors.
 */
export async function confirmAffiliateCommission(orderId: string): Promise<CommissionRow | null> {
  const sql = db();
  const orders = await sql<{
    id: string;
    user_id: string;
    status: string;
    payment_status: string;
    subtotal: string;
    discount: string;
    affiliate_id: string | null;
  }[]>`
    SELECT id, user_id::text AS user_id, status, payment_status,
           subtotal::text AS subtotal, discount::text AS discount, affiliate_id::text AS affiliate_id
    FROM orders WHERE id = ${orderId} LIMIT 1
  `;
  const order = orders[0];
  if (!order?.affiliate_id) return null;
  if (order.payment_status !== "PAID") return null;
  if (order.status !== "DELIVERED") return null;

  const affiliates = await sql<AffiliateRow[]>`SELECT * FROM affiliates WHERE id = ${order.affiliate_id} LIMIT 1`;
  const affiliate = affiliates[0];
  if (!affiliate || affiliate.status !== "ACTIVE") return null;

  const users = await sql<{ phone: string | null }[]>`SELECT phone FROM users WHERE id = ${order.user_id} LIMIT 1`;
  if (
    isSelfReferral({
      affiliateUserId: affiliate.user_id,
      affiliatePhone: affiliate.phone,
      orderUserId: order.user_id,
      orderPhone: users[0]?.phone ?? null,
    })
  ) {
    return null;
  }
  if (
    await hasSharedDeviceOrPayout({
      affiliateUserId: affiliate.user_id,
      affiliateBankAccount: affiliate.bank_account_number,
      orderUserId: order.user_id,
    }).catch(() => false)
  ) {
    return null;
  }

  const config = await getCommissionConfig();
  const { baseKobo, amountKobo } = computeCommissionKobo(
    { subtotalNaira: Number(order.subtotal), discountNaira: Number(order.discount) },
    config,
  );

  try {
    return await sql.begin(async (tx) => {
      const inserted = await tx<CommissionRow[]>`
        INSERT INTO affiliate_commissions (affiliate_id, order_id, base_kobo, amount_kobo, mode, rate_snapshot)
        VALUES (
          ${affiliate.id}, ${orderId}, ${baseKobo}, ${amountKobo}, ${config.mode},
          ${tx.json({ pct: config.pct, flatKobo: config.flatKobo, excludesDeliveryFee: config.excludesDeliveryFee, subtractsDiscount: config.subtractsDiscount })}
        )
        ON CONFLICT (order_id) DO NOTHING
        RETURNING *
      `;
      if (inserted.length === 0) {
        const dup = await tx<CommissionRow[]>`SELECT * FROM affiliate_commissions WHERE order_id = ${orderId} LIMIT 1`;
        return dup[0] ?? null;
      }
      if (amountKobo > 0) {
        const owner: Owner = { type: "AFFILIATE", id: affiliate.id };
        await tx`
          INSERT INTO wallets (owner_type, owner_id, available_kobo, pending_kobo)
          VALUES (${owner.type}, ${owner.id}, 0, 0)
          ON CONFLICT (owner_type, owner_id) DO NOTHING
        `;
        const wallets = await tx<{ pending_kobo: string }[]>`
          SELECT pending_kobo::text AS pending_kobo FROM wallets
          WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} FOR UPDATE
        `;
        const pending = Number(wallets[0]?.pending_kobo ?? 0) + amountKobo;
        await tx`
          UPDATE wallets SET pending_kobo = ${pending}, updated_at = NOW()
          WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
        `;
        await tx`
          INSERT INTO wallet_entries
            (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, order_id, meta)
          VALUES (
            ${owner.type}, ${owner.id}, 'hold', ${amountKobo}, ${pending}, ${orderId},
            ${tx.json({ commissionId: inserted[0].id, baseKobo })}
          )
          ON CONFLICT DO NOTHING
        `;
      }
      return inserted[0];
    });
  } catch {
    return null;
  }
}

/**
 * Reverse/adjust a commission on refund, cancellation, or chargeback.
 * Removes PENDING funds first, then AVAILABLE (which may go negative —
 * withdrawals stay blocked until positive again, same as penalties).
 */
export async function reverseAffiliateCommission(orderId: string, reason: string): Promise<boolean> {
  const sql = db();
  const commissions = await sql<CommissionRow[]>`SELECT * FROM affiliate_commissions WHERE order_id = ${orderId} LIMIT 1`;
  const commission = commissions[0];
  if (!commission || commission.status === "REVERSED") return false;
  const amountKobo = Number(commission.amount_kobo);
  if (amountKobo <= 0) {
    await sql`
      UPDATE affiliate_commissions SET status = 'REVERSED', reversed_at = NOW(), reversed_reason = ${reason}
      WHERE order_id = ${orderId}
    `;
    return true;
  }

  await sql.begin(async (tx) => {
    const owner: Owner = { type: "AFFILIATE", id: commission.affiliate_id };
    const wallets = await tx<{ available_kobo: string; pending_kobo: string }[]>`
      SELECT available_kobo::text AS available_kobo, pending_kobo::text AS pending_kobo FROM wallets
      WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} FOR UPDATE
    `;
    let available = Number(wallets[0]?.available_kobo ?? 0);
    let pending = Number(wallets[0]?.pending_kobo ?? 0);
    const fromPending = Math.min(pending, amountKobo);
    pending -= fromPending;
    available -= amountKobo - fromPending;
    await tx`
      UPDATE wallets SET available_kobo = ${available}, pending_kobo = ${pending}, updated_at = NOW()
      WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
    `;
    await tx`
      INSERT INTO wallet_entries
        (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, order_id, meta)
      VALUES (
        ${owner.type}, ${owner.id}, 'adjustment', ${-amountKobo}, ${available}, ${orderId},
        ${tx.json({ commissionReversal: true, reason })}
      )
    `;
    await tx`
      UPDATE affiliate_commissions
      SET status = 'REVERSED', reversed_at = NOW(), reversed_reason = ${reason}
      WHERE order_id = ${orderId}
    `;
  });
  return true;
}

export type AffiliateStats = {
  clicks: number;
  orders: number;
  salesKobo: number;
  sales: number;
  earningsKobo: number;
  earnings: number;
  conversionRate: number;
};

/** Real data only: clicks, attributed orders, sales, earnings, conversion. */
export async function getAffiliateStats(affiliateId: string): Promise<AffiliateStats> {
  const sql = db();
  const [clicks, agg] = await Promise.all([
    sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM affiliate_clicks WHERE affiliate_id = ${affiliateId}`,
    sql<{ orders: string; sales: string; earnings: string }[]>`
      SELECT COUNT(*)::text AS orders,
             COALESCE(SUM(base_kobo), 0)::text AS sales,
             COALESCE(SUM(amount_kobo), 0)::text AS earnings
      FROM affiliate_commissions
      WHERE affiliate_id = ${affiliateId} AND status <> 'REVERSED'
    `,
  ]);
  const clickCount = Number(clicks[0]?.count ?? 0);
  const orderCount = Number(agg[0]?.orders ?? 0);
  const salesKobo = Number(agg[0]?.sales ?? 0);
  const earningsKobo = Number(agg[0]?.earnings ?? 0);
  return {
    clicks: clickCount,
    orders: orderCount,
    salesKobo,
    sales: salesKobo / 100,
    earningsKobo,
    earnings: earningsKobo / 100,
    conversionRate: clickCount > 0 ? Math.round((orderCount / clickCount) * 1000) / 10 : 0,
  };
}

export type ReferredCustomer = {
  firstName: string;
  /** Masked for privacy (e.g. j***@gmail.com). */
  emailMasked: string;
  orders: number;
  commissionKobo: number;
  commission: number;
  lastOrderAt: string | null;
};

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = (local ?? "").slice(0, 1) || "*";
  return `${head}***@${domain}`;
}

/** Real data only: distinct customers behind non-reversed commissions. */
export async function listReferredCustomers(affiliateId: string, limit = 50): Promise<ReferredCustomer[]> {
  const sql = db();
  const rows = await sql<{
    first_name: string;
    email: string;
    orders: string;
    commission_kobo: string;
    last_order_at: Date | null;
  }[]>`
    SELECT u.first_name, u.email,
           COUNT(c.id)::text AS orders,
           COALESCE(SUM(c.amount_kobo), 0)::text AS commission_kobo,
           MAX(o.created_at) AS last_order_at
    FROM affiliate_commissions c
    JOIN orders o ON o.id = c.order_id
    JOIN users u ON u.id = o.user_id
    WHERE c.affiliate_id = ${affiliateId} AND c.status <> 'REVERSED'
    GROUP BY u.id, u.first_name, u.email
    ORDER BY MAX(o.created_at) DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => {
    const commissionKobo = Number(row.commission_kobo ?? 0);
    return {
      firstName: row.first_name || "Customer",
      emailMasked: maskEmail(row.email ?? ""),
      orders: Number(row.orders ?? 0),
      commissionKobo,
      commission: commissionKobo / 100,
      lastOrderAt: row.last_order_at ? new Date(row.last_order_at).toISOString() : null,
    };
  });
}

/** Admin row: one affiliate with referrals, sales generated, total paid. */
export async function listAffiliatesAdmin(): Promise<
  Array<{
    id: string;
    code: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    status: string;
    statusReason: string | null;
    referrals: number;
    salesKobo: number;
    sales: number;
    paidKobo: number;
    paid: number;
    createdAt: Date;
  }>
> {
  const rows = await db()<{
    id: string;
    code: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    status: string;
    status_reason: string | null;
    created_at: Date;
    referrals: string;
    sales_kobo: string;
    paid_kobo: string;
  }[]>`
    SELECT a.id, a.code, a.full_name, a.phone, a.email, a.status, a.status_reason, a.created_at,
           (SELECT COUNT(*) FROM affiliate_commissions c WHERE c.affiliate_id = a.id AND c.status <> 'REVERSED')::text AS referrals,
           (SELECT COALESCE(SUM(c.base_kobo), 0) FROM affiliate_commissions c WHERE c.affiliate_id = a.id AND c.status <> 'REVERSED')::text AS sales_kobo,
           (SELECT COALESCE(SUM(w.amount_kobo), 0) FROM withdrawals w WHERE w.owner_type = 'AFFILIATE' AND w.owner_id = a.id AND w.status = 'SUCCESS')::text AS paid_kobo
    FROM affiliates a
    ORDER BY a.created_at DESC
    LIMIT 200
  `;
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    status: row.status,
    statusReason: row.status_reason,
    referrals: Number(row.referrals ?? 0),
    salesKobo: Number(row.sales_kobo ?? 0),
    sales: Number(row.sales_kobo ?? 0) / 100,
    paidKobo: Number(row.paid_kobo ?? 0),
    paid: Number(row.paid_kobo ?? 0) / 100,
    createdAt: row.created_at,
  }));
}

/** Monthly leaderboard: top 10 affiliates by sales in the current month. */
export async function getAffiliateLeaderboard(limit = 10): Promise<
  Array<{ affiliateId: string; code: string; fullName: string; orders: number; salesKobo: number; sales: number; earningsKobo: number; earnings: number }>
> {
  const rows = await db()<{
    affiliate_id: string;
    code: string;
    full_name: string;
    orders: string;
    sales_kobo: string;
    earnings_kobo: string;
  }[]>`
    SELECT c.affiliate_id::text AS affiliate_id, a.code, a.full_name,
           COUNT(*)::text AS orders,
           COALESCE(SUM(c.base_kobo), 0)::text AS sales_kobo,
           COALESCE(SUM(c.amount_kobo), 0)::text AS earnings_kobo
    FROM affiliate_commissions c
    JOIN affiliates a ON a.id = c.affiliate_id
    WHERE c.status <> 'REVERSED'
      AND c.created_at >= date_trunc('month', NOW())
    GROUP BY c.affiliate_id, a.code, a.full_name
    ORDER BY SUM(c.base_kobo) DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    affiliateId: row.affiliate_id,
    code: row.code,
    fullName: row.full_name,
    orders: Number(row.orders ?? 0),
    salesKobo: Number(row.sales_kobo ?? 0),
    sales: Number(row.sales_kobo ?? 0) / 100,
    earningsKobo: Number(row.earnings_kobo ?? 0),
    earnings: Number(row.earnings_kobo ?? 0) / 100,
  }));
}

export async function suspendAffiliate(
  affiliateId: string,
  status: Extract<AffiliateStatus, "SUSPENDED" | "BANNED" | "ACTIVE">,
  reason: string | null,
): Promise<void> {
  if ((status === "SUSPENDED" || status === "BANNED") && !reason?.trim()) {
    throw ApiError.validation("A reason is required to suspend or ban an affiliate.");
  }
  await db()`
    UPDATE affiliates
    SET status = ${status}, status_reason = ${reason?.trim() || null}, updated_at = NOW()
    WHERE id = ${affiliateId}
  `;
}
