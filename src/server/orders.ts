import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { db } from "./db";
import { ApiError } from "./errors";
import { notifyUser } from "./vendors";
import { lookupContact } from "./notify";
import { sendPaymentConfirmedEmail, sendVendorNewOrderEmail } from "./email";
import { assertOrderTransition } from "./order-transitions";
import { assertPurchasable, getCartView } from "./queries/cart";
import { assertVendorsAccepting } from "./availability";
import type {
  CheckoutOrderSummary,
  CheckoutResult,
  OrderDetail,
  OrderListItem,
  OrderStatus,
} from "../lib/order-types";
import type { CartItemView } from "../lib/order-types";

// ── Pure helpers (unit-testable) ──────────────────────────────────────────

export type OrderLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  customInstructions: string | null;
};

export type VendorGroup = {
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  lines: OrderLine[];
};

export type OrderTotals = {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
};

export type PricingConfig = {
  serviceFeeType: "PERCENT" | "FLAT";
  serviceFeeValue: number;
  taxRatePercent: number;
};

export const DEFAULT_PRICING: PricingConfig = {
  serviceFeeType: "PERCENT",
  serviceFeeValue: 5,
  taxRatePercent: 7.5,
};

export function normalizePricingConfig(value: unknown): PricingConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_PRICING };
  const record = value as Record<string, unknown>;
  const rawType = record.service_fee_type ?? record.serviceFeeType;
  const rawFee = record.service_fee_value ?? record.serviceFeeValue;
  const rawTax = record.tax_rate_percent ?? record.taxRatePercent;
  const serviceFeeType = rawType === "FLAT" ? "FLAT" : "PERCENT";
  const serviceFeeValue =
    typeof rawFee === "number" && Number.isFinite(rawFee) && rawFee >= 0
      ? rawFee
      : DEFAULT_PRICING.serviceFeeValue;
  const taxRatePercent =
    typeof rawTax === "number" && Number.isFinite(rawTax) && rawTax >= 0
      ? Math.min(rawTax, 100)
      : DEFAULT_PRICING.taxRatePercent;
  return { serviceFeeType, serviceFeeValue, taxRatePercent };
}

export async function getPricingConfig(): Promise<PricingConfig> {
  try {
    const rows = await db()<{ value: unknown }[]>`
      SELECT value FROM platform_settings WHERE key = 'pricing_config' LIMIT 1
    `;
    if (rows.length === 0) return { ...DEFAULT_PRICING };
    return normalizePricingConfig(rows[0].value);
  } catch {
    return { ...DEFAULT_PRICING };
  }
}

/** Whether new orders should require a delivery handshake code. Pure config read. */
export async function getOtpEnabled(): Promise<boolean> {
  try {
    const rows = await db()<{ value: unknown }[]>`
      SELECT value FROM platform_settings WHERE key IN ('pricing_config', 'delivery_config')
    `;
    for (const row of rows) {
      if (!row.value || typeof row.value !== "object" || Array.isArray(row.value)) continue;
      const record = row.value as Record<string, unknown>;
      const flag = record.otp_enabled ?? record.otpEnabled ?? record.require_otp ?? record.requireOtp;
      if (typeof flag === "boolean") return flag;
    }
    return true;
  } catch {
    return true;
  }
}

/** 4-digit delivery handshake code shown to the customer. */
export function generateDeliveryOtp(): string {
  return String(randomInt(1000, 10000));
}

/** Fallback when order_config is absent. Configurable without a redeploy. */
export const VENDOR_ACCEPT_TIMEOUT_MINUTES = 30;

/** Unpaid checkouts rot after a day: stock + coupons return to the pool. */
export const PENDING_PAYMENT_TIMEOUT_MINUTES = 24 * 60;

/**
 * POLICY DEFAULT (tune via order_config.unclaimed_refund_hours): a paid
 * order no rider ever claimed is auto-cancelled + refunded this long after
 * it became claimable. Food cannot wait forever and the customer should not
 * have to discover the cancel button themselves.
 */
export const UNCLAIMED_REFUND_HOURS = 6;

/** Pure config resolution — unit-testable without a database. */
export function resolveVendorAcceptTimeout(value: unknown): number {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const minutes = Number(record.vendor_accept_timeout_minutes);
  if (Number.isFinite(minutes) && minutes > 0) return Math.round(minutes);
  return VENDOR_ACCEPT_TIMEOUT_MINUTES;
}

export async function getVendorAcceptTimeoutMinutes(): Promise<number> {
  try {
    const rows = await db()<{ value: unknown }[]>`
      SELECT value FROM platform_settings WHERE key = 'order_config' LIMIT 1
    `;
    return resolveVendorAcceptTimeout(rows[0]?.value);
  } catch {
    return VENDOR_ACCEPT_TIMEOUT_MINUTES;
  }
}

export function resolvePendingPaymentTimeout(value: unknown): number {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const minutes = Number(record.pending_payment_timeout_minutes);
  if (Number.isFinite(minutes) && minutes > 0) return Math.round(minutes);
  return PENDING_PAYMENT_TIMEOUT_MINUTES;
}

export function resolveUnclaimedRefundHours(value: unknown): number {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const hours = Number(record.unclaimed_refund_hours);
  if (Number.isFinite(hours) && hours > 0) return hours;
  return UNCLAIMED_REFUND_HOURS;
}

export async function getUnclaimedRefundHours(): Promise<number> {
  try {
    const rows = await db()<{ value: unknown }[]>`
      SELECT value FROM platform_settings WHERE key = 'order_config' LIMIT 1
    `;
    return resolveUnclaimedRefundHours(rows[0]?.value);
  } catch {
    return UNCLAIMED_REFUND_HOURS;
  }
}

/**
 * Lazy no-rider-found resolution (no cron needed): paid orders that sat
 * claimable past the window with no rider ever taking them are cancelled
 * and refunded for real. Only orders with no open delivery qualify, so a
 * held job is never yanked mid-trip. Bounded and idempotent — each order
 * flips exactly once (status predicate). Called best-effort from order
 * read paths next to releaseStalePaidOrders.
 */
export async function refundStaleUnclaimedOrders(limit = 10): Promise<number> {
  const sql = db();
  const hours = await getUnclaimedRefundHours();
  const stale = await sql<{ id: string; order_number: string; user_id: string }[]>`
    SELECT o.id, o.order_number, o.user_id FROM orders o
    WHERE o.status IN ('PREPARING', 'READY_FOR_PICKUP')
      AND o.payment_status = 'PAID'
      AND o.delivery_partner_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM deliveries d
        WHERE d.order_id = o.id AND d.status NOT IN ('FAILED', 'CANCELLED')
      )
      AND GREATEST(
        o.created_at,
        COALESCE(
          (SELECT MAX(created_at) FROM order_status_history h
           WHERE h.order_id = o.id AND h.status = 'READY_FOR_PICKUP'),
          o.created_at
        )
      ) < NOW() - make_interval(hours => ${hours})
    ORDER BY o.created_at ASC
    LIMIT ${limit}
  `;
  let refunded = 0;
  for (const order of stale) {
    try {
      const updated = await sql<{ id: string }[]>`
        UPDATE orders
        SET status = 'CANCELLED', dispatch_status = 'CANCELLED', payment_status = 'REFUNDED',
            cancelled_at = NOW(),
            cancelled_reason = 'Auto-cancelled: no rider claimed the order in time.',
            updated_at = NOW()
        WHERE id = ${order.id}
          AND status IN ('PREPARING', 'READY_FOR_PICKUP')
          AND delivery_partner_id IS NULL
        RETURNING id
      `;
      if (!updated[0]) continue;
      await sql`
        INSERT INTO order_status_history (order_id, status, note)
        VALUES (${order.id}, 'CANCELLED', 'Auto-cancelled: no rider claimed the order in time.')
      `;
      await releaseCouponForOrder(order.id).catch(() => undefined);
      await restoreStockForOrder(order.id).catch(() => undefined);
      const { refundOrderPayment } = await import("./refunds");
      await refundOrderPayment(order.id, "Auto-cancelled: no rider claimed the order in time.");
      await notifyUser({
        userId: order.user_id,
        type: "ORDER",
        title: `Order ${order.order_number} was cancelled`,
        body: "No rider was available for your order, so it was cancelled automatically. Your payment will be refunded. If it does not arrive within a few days, contact support.",
        data: { orderId: order.id, status: "CANCELLED", autoCancelled: true },
      }).catch(() => undefined);
      refunded += 1;
    } catch {
      // one stuck order must never block the rest
    }
  }
  return refunded;
}

export async function getPendingPaymentTimeoutMinutes(): Promise<number> {
  try {
    const rows = await db()<{ value: unknown }[]>`
      SELECT value FROM platform_settings WHERE key = 'order_config' LIMIT 1
    `;
    return resolvePendingPaymentTimeout(rows[0]?.value);
  } catch {
    return PENDING_PAYMENT_TIMEOUT_MINUTES;
  }
}

/**
 * Lazy unpaid-checkout expiry (no cron needed): cancel PENDING_PAYMENT
 * orders past the window so reserved stock and coupon redemptions return to
 * the pool. Called best-effort from checkout + order reads. Bounded and
 * idempotent — each order flips exactly once (status predicate).
 */
export async function expireStalePendingPayments(userId: string, limit = 20): Promise<number> {
  const sql = db();
  const timeoutMinutes = await getPendingPaymentTimeoutMinutes();
  const stale = await sql<{ id: string; order_number: string }[]>`
    SELECT id, order_number FROM orders
    WHERE user_id = ${userId} AND status = 'PENDING_PAYMENT'
      AND created_at < NOW() - make_interval(mins => ${timeoutMinutes})
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
  let expired = 0;
  for (const order of stale) {
    try {
      const updated = await sql<{ id: string }[]>`
        UPDATE orders
        SET status = 'CANCELLED', dispatch_status = 'CANCELLED', updated_at = NOW(),
            cancelled_at = NOW(), cancelled_reason = 'Expired: payment was never completed.'
        WHERE id = ${order.id} AND status = 'PENDING_PAYMENT'
        RETURNING id
      `;
      if (!updated[0]) continue;
      await sql`
        INSERT INTO order_status_history (order_id, status, note)
        VALUES (${order.id}, 'CANCELLED', 'Expired: payment was never completed.')
      `;
      await releaseCouponForOrder(order.id).catch(() => undefined);
      await restoreStockForOrder(order.id).catch(() => undefined);
      await notifyUser({
        userId,
        type: "ORDER",
        title: `Order ${order.order_number} expired`,
        body: "You never completed payment, so this order was cancelled and the items were released. Nothing was charged.",
        data: { orderId: order.id, status: "CANCELLED", expired: true },
      }).catch(() => undefined);
      expired += 1;
    } catch {
      // one stale order must never block the rest
    }
  }
  return expired;
}

/**
 * Lazy vendor-response timeout (no cron needed): cancel PAID orders the
 * vendor never accepted within the configured window, refund them for real,
 * and notify the customer. Called best-effort from order read paths, so a
 * stuck order is released the next time anyone looks at orders. Bounded and
 * idempotent — each order flips exactly once (status predicate).
 */
export async function releaseStalePaidOrders(limit = 20): Promise<number> {
  const sql = db();
  const timeoutMinutes = await getVendorAcceptTimeoutMinutes();
  const stale = await sql<{ id: string; order_number: string; user_id: string }[]>`
    SELECT id, order_number, user_id FROM orders
    WHERE status = 'PAID' AND updated_at < NOW() - make_interval(mins => ${timeoutMinutes})
    ORDER BY updated_at ASC
    LIMIT ${limit}
  `;
  let released = 0;
  for (const order of stale) {
    try {
      const updated = await sql<{ id: string }[]>`
        UPDATE orders
        SET status = 'CANCELLED', dispatch_status = 'CANCELLED', payment_status = 'REFUNDED',
            cancelled_at = NOW(),
            cancelled_reason = 'Auto-cancelled: the vendor did not respond in time.',
            updated_at = NOW()
        WHERE id = ${order.id} AND status = 'PAID'
        RETURNING id
      `;
      if (!updated[0]) continue;
      await sql`
        INSERT INTO order_status_history (order_id, status, note)
        VALUES (${order.id}, 'CANCELLED', 'Auto-cancelled: the vendor did not respond in time.')
      `;
      await releaseCouponForOrder(order.id).catch(() => undefined);
      await restoreStockForOrder(order.id).catch(() => undefined);
      const { refundOrderPayment } = await import("./refunds");
      await refundOrderPayment(order.id, "Auto-cancelled: the vendor did not respond in time.");
      await notifyUser({
        userId: order.user_id,
        type: "ORDER",
        title: `Order ${order.order_number} was cancelled`,
        body: "The vendor did not respond in time, so your order was cancelled automatically. Your payment will be refunded. If it does not arrive within a few days, contact support.",
        data: { orderId: order.id, status: "CANCELLED", autoCancelled: true },
      }).catch(() => undefined);
      released += 1;
    } catch {
      // one stuck order must never block the rest
    }
  }
  return released;
}

/**
 * Wrong-code attempts before the rider is locked out of the delivery-code
 * handshake and an admin must re-issue the code. The SAME constant drives
 * the deliver handler and the lockout wording, so they can never disagree.
 */
export const DELIVERY_CODE_MAX_ATTEMPTS = 5;

/** Handover-code lifetime from minting (pickup or admin re-issue). */
export const DELIVERY_CODE_TTL_HOURS = 4;

/**
 * Issue (or re-issue) the 4-digit handover code for an order. Called when
 * the rider picks up the order and by the admin override. Resets the
 * wrong-attempt counter so a fresh code always means fresh attempts.
 * Returns the code (or null when the OTP handshake is disabled by config).
 */
export async function issueDeliveryCode(orderId: string): Promise<string | null> {
  const enabled = await getOtpEnabled().catch(() => true);
  const code = enabled ? generateDeliveryOtp() : null;
  const salt = code ? newDeliveryCodeSalt() : null;
  await db()`
    UPDATE orders
    SET delivery_otp = NULL, delivery_code_hash = ${code && salt ? hashDeliveryCodeSalted(code, salt) : null},
        delivery_code_salt = ${salt},
        delivery_code_expires_at = CASE WHEN ${code !== null} THEN NOW() + make_interval(hours => ${DELIVERY_CODE_TTL_HOURS}) ELSE NULL END,
        require_otp = ${enabled}, updated_at = NOW()
    WHERE id = ${orderId}
  `;
  await db()`
    UPDATE deliveries SET delivery_code_attempts = 0
    WHERE order_id = ${orderId} AND status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')
  `;
  return code;
}

/** Single hashing implementation lives in dispatch.ts; imported here so
 *  verifiers target one digest format (re-exported for consumers). */
import { hashDeliveryCode, hashDeliveryCodeSalted, newDeliveryCodeSalt } from "./dispatch";
export { hashDeliveryCode, hashDeliveryCodeSalted, newDeliveryCodeSalt };

/**
 * Dual-read verifier for the hashing transition: hashed codes (issued after
 * migration 015) compare digests in constant time; legacy plaintext codes
 * still in flight compare as before. Either way the plaintext code is never
 * logged or returned.
 */
export function verifyDeliveryCode(
  supplied: string | null,
  hash: string | null,
  legacyPlaintext: string | null,
  salt?: string | null,
): boolean {
  if (!supplied || !supplied.trim()) return false;
  const attempt = supplied.trim();
  // Salted rows first (new codes); legacy unsalted rows during transition.
  if (salt && hash?.startsWith("v1$")) {
    const parts = hash.split("$");
    if (parts.length === 3 && parts[1] === salt) {
      const a = Buffer.from(createHash("sha256").update(salt + attempt).digest("hex"));
      const b = Buffer.from(parts[2]);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    }
    return false;
  }
  if (hash) {
    const a = Buffer.from(hashDeliveryCode(attempt));
    const b = Buffer.from(hash);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
  return verifyDeliveryOtp(legacyPlaintext, attempt);
}

/** Timing-safe comparison for short delivery codes. */
export function verifyDeliveryOtp(expected: string | null, supplied: string | null): boolean {
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected.trim());
  const b = Buffer.from(supplied.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Service/platform fee for one vendor order subtotal. Pure and unit-tested. */
export function computeServiceFee(subtotal: number, pricing: PricingConfig): number {
  if (subtotal <= 0) return 0;
  if (pricing.serviceFeeType === "FLAT") {
    return roundMoney(Math.max(0, pricing.serviceFeeValue));
  }
  const percent = Math.min(Math.max(0, pricing.serviceFeeValue), 100);
  return roundMoney((subtotal * percent) / 100);
}

/** Tax on (subtotal - discount + serviceFee). Pure and unit-tested. */
export function computeTaxAmount(taxableBase: number, pricing: PricingConfig): number {
  if (taxableBase <= 0) return 0;
  const rate = Math.min(Math.max(0, pricing.taxRatePercent), 100);
  return roundMoney((taxableBase * rate) / 100);
}

export function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function toKobo(naira: number): number {
  return Math.round(naira * 100);
}

export function computeOrderTotals(
  lines: OrderLine[],
  deliveryFee: number,
  discount = 0,
  extra: { serviceFee?: number; tax?: number } = {},
): OrderTotals {
  const subtotal = roundMoney(
    lines.reduce((sum, line) => sum + roundMoney(line.unitPrice * line.quantity), 0),
  );
  const fee = Math.max(0, roundMoney(deliveryFee));
  const serviceFee = Math.max(0, roundMoney(extra.serviceFee ?? 0));
  const tax = Math.max(0, roundMoney(extra.tax ?? 0));
  const discountAmount = Math.min(Math.max(0, roundMoney(discount)), subtotal + fee + serviceFee + tax);
  return {
    subtotal,
    deliveryFee: fee,
    serviceFee,
    tax,
    discount: roundMoney(discountAmount),
    total: roundMoney(subtotal + fee + serviceFee + tax - discountAmount),
  };
}

export function groupCartByVendor(items: CartItemView[]): VendorGroup[] {
  const grouped = new Map<string, VendorGroup>();
  for (const item of items) {
    let group = grouped.get(item.vendor.id);
    if (!group) {
      group = {
        vendorId: item.vendor.id,
        vendorName: item.vendor.businessName,
        vendorSlug: item.vendor.slug,
        lines: [],
      };
      grouped.set(item.vendor.id, group);
    }
    group.lines.push({
      productId: item.product.id,
      name: item.product.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      customInstructions: item.customInstructions,
    });
  }
  return [...grouped.values()];
}

export function generateOrderNumber(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `SV-${year}${month}${day}-${suffix}`;
}

// ── Coupons ─────────────────────────────────────────────────────────────────

export type CouponTerms = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maxUses: number | null;
  usedCount: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  vendorId: string | null;
  vendorName: string | null;
};

type CouponRow = {
  id: string;
  code: string;
  type: string;
  value: string;
  max_uses: number | null;
  used_count: number;
  starts_at: Date | null;
  expires_at: Date | null;
  is_active: boolean;
  vendor_id: string | null;
  vendor_name: string | null;
};

function toCouponTerms(row: CouponRow): CouponTerms {
  return {
    id: row.id,
    code: row.code,
    type: row.type as "PERCENT" | "FIXED",
    value: Number(row.value),
    maxUses: row.max_uses,
    usedCount: row.used_count,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
  };
}

export async function getCouponByCode(code: string): Promise<CouponTerms | undefined> {
  const rows = await db()<CouponRow[]>`
    SELECT c.id, c.code, c.type, c.value, c.max_uses, c.used_count,
           c.starts_at, c.expires_at, c.is_active, c.vendor_id,
           v.business_name AS vendor_name
    FROM coupons c
    LEFT JOIN vendors v ON v.id = c.vendor_id
    WHERE lower(c.code) = lower(${code.trim()})
    LIMIT 1
  `;
  return rows[0] ? toCouponTerms(rows[0]) : undefined;
}

export function assertCouponUsable(coupon: CouponTerms): void {
  if (!coupon.isActive) {
    throw ApiError.validation("This coupon is no longer active.");
  }
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw ApiError.validation("This coupon is not active yet.");
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    throw ApiError.validation("This coupon has expired.");
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw ApiError.conflict("This coupon has reached its usage limit.");
  }
}

/** Naira discount for one vendor order subtotal. Pure and unit-tested. */
export function computeCouponDiscount(
  coupon: Pick<CouponTerms, "type" | "value">,
  subtotal: number,
): number {
  if (subtotal <= 0) return 0;
  if (coupon.type === "PERCENT") {
    const percent = Math.min(Math.max(0, coupon.value), 100);
    return roundMoney((subtotal * percent) / 100);
  }
  return roundMoney(Math.min(Math.max(0, coupon.value), subtotal));
}

export type QuoteLine = {
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  couponApplied: boolean;
};

export type CheckoutQuote = {
  lines: QuoteLine[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  pricing: PricingConfig;
  coupon: { code: string; type: string; value: number; vendorName: string | null } | null;
};

/** Per-vendor checkout preview with coupon math, without creating orders. */
export async function quoteCheckout(
  userId: string,
  addressId: string | undefined,
  couponCode: string | undefined,
): Promise<CheckoutQuote> {
  const cart = await getCartView(userId);
  if (cart.items.length === 0) {
    throw ApiError.validation("Your cart is empty.");
  }

  let city = "";
  if (addressId) {
    const sql = db();
    const addresses = await sql<{ city: string }[]>`
      SELECT city FROM addresses WHERE id = ${addressId} AND user_id = ${userId} LIMIT 1
    `;
    if (addresses.length === 0) {
      throw ApiError.notFound("Address not found.");
    }
    city = addresses[0].city;
  }

  let coupon: CouponTerms | undefined;
  if (couponCode?.trim()) {
    coupon = await getCouponByCode(couponCode);
    if (!coupon) {
      throw ApiError.notFound("Coupon not found. Check the code and try again.");
    }
    assertCouponUsable(coupon);
  }

  const groups = groupCartByVendor(cart.items);
  const scopedVendor = coupon?.vendorId;
  if (coupon && scopedVendor && !groups.some((group) => group.vendorId === scopedVendor)) {
    throw ApiError.validation(`Coupon ${coupon.code} only applies to ${coupon.vendorName ?? "a specific kitchen"} — none of your items qualify.`);
  }

  // Same closed-kitchen guard as order creation: the quote must fail with
  // 409 VENDOR_CLOSED rather than price an order that can never be placed.
  // Uses the computed schedule availability (override > exception > weekly).
  await assertVendorsAccepting(groups.map((group) => group.vendorId));

  const pricing = await getPricingConfig();
  const lines: QuoteLine[] = [];
  for (const group of groups) {
    const deliveryFee = city ? await getDeliveryFeeFor(city) : 0;
    const activeCoupon = coupon && (!coupon.vendorId || coupon.vendorId === group.vendorId) ? coupon : undefined;
    const subtotal = roundMoney(group.lines.reduce((sum, line) => sum + roundMoney(line.unitPrice * line.quantity), 0));
    const discount = activeCoupon ? computeCouponDiscount(activeCoupon, subtotal) : 0;
    const serviceFee = computeServiceFee(subtotal, pricing);
    const tax = computeTaxAmount(subtotal - discount + serviceFee, pricing);
    const totals = computeOrderTotals(group.lines, deliveryFee, discount, { serviceFee, tax });
    lines.push({
      vendorId: group.vendorId,
      vendorName: group.vendorName,
      vendorSlug: group.vendorSlug,
      subtotal: totals.subtotal,
      deliveryFee: totals.deliveryFee,
      serviceFee: totals.serviceFee,
      tax: totals.tax,
      discount: totals.discount,
      total: totals.total,
      couponApplied: discount > 0,
    });
  }

  return {
    lines,
    subtotal: roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0)),
    deliveryFee: roundMoney(lines.reduce((sum, line) => sum + line.deliveryFee, 0)),
    serviceFee: roundMoney(lines.reduce((sum, line) => sum + line.serviceFee, 0)),
    tax: roundMoney(lines.reduce((sum, line) => sum + line.tax, 0)),
    discount: roundMoney(lines.reduce((sum, line) => sum + line.discount, 0)),
    total: roundMoney(lines.reduce((sum, line) => sum + line.total, 0)),
    pricing,
    coupon: coupon
      ? { code: coupon.code, type: coupon.type, value: coupon.value, vendorName: coupon.vendorName }
      : null,
  };
}

// ── Database access ──────────────────────────────────────────────────────

async function getDeliveryFeeFor(city: string): Promise<number> {
  const sql = db();
  const rows = await sql<{ fee: string }[]>`
    SELECT delivery_fee::text AS fee
    FROM locations
    WHERE is_active = TRUE AND (lower(name) = lower(${city}) OR lower(city) = lower(${city}))
    ORDER BY (lower(name) = lower(${city})) DESC
    LIMIT 1
  `;
  return rows.length > 0 ? Number(rows[0].fee) : 0;
}

type AddressRow = { id: string; city: string; state: string; full_address: string; recipient_name: string | null; phone: string | null };

export async function createOrdersFromCart(
  userId: string,
  addressId: string,
  deliveryInstructions?: string,
  couponCode?: string,
): Promise<CheckoutResult> {
  const sql = db();
  const cart = await getCartView(userId);
  if (cart.items.length === 0) {
    throw ApiError.validation("Your cart is empty.");
  }

  // Abuse cap: each unpaid checkout holds stock (and possibly a coupon
  // redemption) for up to 24h. Bounding open PENDING_PAYMENT orders per user
  // bounds the drain one account can cause, coupon or not.
  const openOrders = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM orders
    WHERE user_id = ${userId} AND status = 'PENDING_PAYMENT'
  `;
  if (Number(openOrders[0]?.count ?? 0) >= 10) {
    throw ApiError.conflict(
      "You have too many unpaid orders. Complete or wait for payment on an open order before checking out again.",
    );
  }

  const addressRows = await sql<AddressRow[]>`
    SELECT id, city, state, full_address, recipient_name, phone
    FROM addresses
    WHERE id = ${addressId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (addressRows.length === 0) {
    throw ApiError.notFound("Address not found.");
  }

  const unavailable: string[] = [];
  for (const item of cart.items) {
    try {
      await assertPurchasable(item.product.id);
    } catch {
      unavailable.push(item.product.name);
    }
  }
  if (unavailable.length > 0) {
    throw ApiError.validation(
      `Some items in your cart are no longer available: ${unavailable.slice(0, 3).join(", ")}. Please remove them before checkout.`,
    );
  }

  const groups = groupCartByVendor(cart.items);

  // A kitchen can close (toggle or schedule) after the shopper filled the
  // cart: reject with 409 VENDOR_CLOSED so the client can show the "Closed"
  // state instead of minting PENDING_PAYMENT orders that hold stock.
  // Computed live from override > exception > weekly schedule.
  await assertVendorsAccepting(groups.map((group) => group.vendorId));

  let coupon: CouponTerms | undefined;
  if (couponCode?.trim()) {
    coupon = await getCouponByCode(couponCode);
    if (!coupon) {
      throw ApiError.notFound("Coupon not found. Check the code and try again.");
    }
    assertCouponUsable(coupon);
    const scopedVendorId: string | null = coupon.vendorId;
    if (scopedVendorId && !groups.some((group) => group.vendorId === scopedVendorId)) {
      throw ApiError.validation(`Coupon ${coupon.code} only applies to ${coupon.vendorName ?? "a specific kitchen"} — none of your items qualify.`);
    }
  }

  const orders: CheckoutOrderSummary[] = [];
  const pricing = await getPricingConfig();

  await sql.begin(async (tx) => {
    // Claim one redemption up front so concurrent checkouts cannot overspend max_uses.
    if (coupon) {
      const claims = await tx<{ id: string }[]>`
        UPDATE coupons SET used_count = used_count + 1
        WHERE id = ${coupon.id} AND (max_uses IS NULL OR used_count < max_uses)
        RETURNING id
      `;
      if (!claims[0]) {
        throw ApiError.conflict("This coupon has just reached its usage limit.");
      }
    }

    // Reserve stock up front (NULL stock_quantity = untracked/infinite).
    // The guarded UPDATE makes concurrent checkouts serialize on the row:
    // losers get zero rows back instead of overselling.
    for (const group of groups) {
      for (const line of group.lines) {
        if (!line.productId) continue;
        const reserved = await tx<{ id: string }[]>`
          UPDATE products SET stock_quantity = stock_quantity - ${line.quantity}, updated_at = NOW()
          WHERE id = ${line.productId}
            AND (stock_quantity IS NULL OR stock_quantity >= ${line.quantity})
          RETURNING id
        `;
        if (!reserved[0]) {
          throw ApiError.validation(
            `Sorry — "${line.name}" just ran out (only a few left). Please adjust the quantity and try again.`,
          );
        }
      }
    }

    for (const group of groups) {
      const deliveryFee = await getDeliveryFeeFor(addressRows[0].city);
      const activeCoupon = coupon && (!coupon.vendorId || coupon.vendorId === group.vendorId) ? coupon : undefined;
      const subtotal = roundMoney(group.lines.reduce((sum, line) => sum + roundMoney(line.unitPrice * line.quantity), 0));
      const discount = activeCoupon ? computeCouponDiscount(activeCoupon, subtotal) : 0;
      const serviceFee = computeServiceFee(subtotal, pricing);
      const tax = computeTaxAmount(subtotal - discount + serviceFee, pricing);
      const totals = computeOrderTotals(group.lines, deliveryFee, discount, { serviceFee, tax });

      let orderId: string | undefined;
      let orderNumber: string | undefined;
      for (let attempt = 0; attempt < 5 && !orderId; attempt += 1) {
        const candidate = generateOrderNumber();
        try {
          const inserted = await tx<{ id: string }[]>`
            INSERT INTO orders (
              order_number, user_id, vendor_id, address_id, status,
              currency, subtotal, delivery_fee, service_fee, tax_amount, discount, total,
              payment_provider, payment_status, delivery_instructions, coupon_code
            )
            VALUES (
              ${candidate}, ${userId}, ${group.vendorId}, ${addressId},
              'PENDING_PAYMENT', 'NGN', ${totals.subtotal}, ${totals.deliveryFee}, ${totals.serviceFee}, ${totals.tax}, ${totals.discount}, ${totals.total},
              'PAYSTACK', 'PENDING', ${deliveryInstructions ?? null}, ${discount > 0 && coupon ? coupon.code : null}
            )
            RETURNING id
          `;
          orderId = inserted[0].id;
          orderNumber = candidate;
        } catch (error) {
          if ((error as { code?: string }).code !== "23505") throw error;
        }
      }
      if (!orderId || !orderNumber) {
        throw new Error("Could not allocate a unique order number.");
      }

      for (const line of group.lines) {
        await tx`
          INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, line_total, custom_instructions)
          VALUES (
            ${orderId}, ${line.productId}, ${line.name}, ${line.unitPrice},
            ${line.quantity}, ${roundMoney(line.unitPrice * line.quantity)}, ${line.customInstructions}
          )
        `;
      }

      await tx`
        INSERT INTO order_status_history (order_id, status)
        VALUES (${orderId}, 'PENDING_PAYMENT')
      `;

      orders.push({
        id: orderId,
        orderNumber,
        vendorName: group.vendorName,
        vendorSlug: group.vendorSlug,
        ...totals,
        currency: "NGN",
      });
    }
  });

  return { orders, clearedItems: 0 };
}

type OrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: string;
  currency: string;
  subtotal: string;
  delivery_fee: string;
  service_fee: string | null;
  tax_amount: string | null;
  discount: string;
  total: string;
  delivery_otp: string | null;
  require_otp: boolean | null;
  created_at: Date;
  vendor_id: string;
  business_name: string;
  vendor_slug: string;
  delivery_instructions: string | null;
  item_count: string;
  total_count: string;
  full_address: string | null;
  address_city: string | null;
  address_state: string | null;
  recipient_name: string | null;
  phone: string | null;
  has_rider: boolean;
  review_id: string | null;
  review_customer_id: string | null;
  review_rider_id: string | null;
  review_vendor_rating: number | null;
  review_vendor_comment: string | null;
  review_rider_rating: number | null;
  review_rider_comment: string | null;
  review_is_hidden: boolean | null;
  review_created_at: Date | null;
};

const ORDER_SELECT = `
  SELECT
    o.id, o.order_number, o.status, o.payment_status, o.currency,
    o.subtotal::text, o.delivery_fee::text,
    COALESCE(o.service_fee, 0)::text AS service_fee,
    COALESCE(o.tax_amount, 0)::text AS tax_amount,
    o.discount::text, o.total::text,
    o.delivery_otp, COALESCE(o.require_otp, FALSE) AS require_otp,
    o.created_at, o.vendor_id, o.delivery_instructions,
    v.business_name, v.slug AS vendor_slug,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::text AS item_count,
    COUNT(*) OVER()::text AS total_count,
    a.full_address, a.city AS address_city, a.state AS address_state, a.recipient_name, a.phone,
    (o.delivery_partner_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM deliveries d WHERE d.order_id = o.id AND d.delivery_partner_id IS NOT NULL
    )) AS has_rider,
    rv.id AS review_id, rv.customer_id AS review_customer_id, rv.rider_id AS review_rider_id,
    rv.vendor_rating AS review_vendor_rating, rv.vendor_comment AS review_vendor_comment,
    rv.rider_rating AS review_rider_rating, rv.rider_comment AS review_rider_comment,
    rv.is_hidden AS review_is_hidden, rv.created_at AS review_created_at
  FROM orders o
  JOIN vendors v ON v.id = o.vendor_id
  LEFT JOIN addresses a ON a.id = o.address_id
  LEFT JOIN order_reviews rv ON rv.order_id = o.id
`;

function toListItem(row: OrderRow): OrderListItem {
  const ordersBase = {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status as OrderListItem["paymentStatus"],
    currency: row.currency,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    serviceFee: Number(row.service_fee ?? 0),
    tax: Number(row.tax_amount ?? 0),
    discount: Number(row.discount),
    total: Number(row.total),
    createdAt: row.created_at.toISOString(),
    vendor: { id: row.vendor_id, name: row.business_name, slug: row.vendor_slug },
    itemCount: Number(row.item_count),
    hasRider: Boolean(row.has_rider),
    review: row.review_id
      ? {
          id: row.review_id,
          orderId: row.id,
          customerId: row.review_customer_id ?? "",
          vendorId: row.vendor_id,
          riderId: row.review_rider_id,
          vendorRating: row.review_vendor_rating ?? 0,
          vendorComment: row.review_vendor_comment,
          riderRating: row.review_rider_rating,
          riderComment: row.review_rider_comment,
          isHidden: row.review_is_hidden ?? false,
          createdAt:
            row.review_created_at instanceof Date
              ? row.review_created_at.toISOString()
              : String(row.review_created_at),
        }
      : null,
  };
  return ordersBase;
}

export async function listOrdersForUser(
  userId: string,
  page = 1,
  limit = 20,
): Promise<{ items: OrderListItem[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const sql = db();
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(48, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;

  const rows = await sql.unsafe<OrderRow[]>(
    `${ORDER_SELECT} WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
    [userId, safeLimit, offset],
  );

  const items = rows.map(toListItem);
  let total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  if (rows.length === 0) {
    const counted = await sql.unsafe<{ count: string }[]>(`SELECT COUNT(*)::text AS count FROM orders WHERE user_id = $1`, [
      userId,
    ]);
    total = Number(counted[0]?.count ?? 0);
  }
  return {
    items,
    total,
    page: safePage,
    pageSize: safeLimit,
    totalPages: total > 0 ? Math.max(1, Math.ceil(total / safeLimit)) : 0,
  };
}

type LineRow = {
  id: string;
  product_id: string | null;
  name: string;
  unit_price: string;
  quantity: number;
  line_total: string;
  custom_instructions: string | null;
};

export async function getOrderForUser(userId: string, orderId: string): Promise<OrderDetail> {
  const sql = db();
  const rows = await sql.unsafe<OrderRow[]>(
    `${ORDER_SELECT} WHERE o.id = $1 AND o.user_id = $2 LIMIT 1`,
    [orderId, userId],
  );
  if (rows.length === 0) {
    throw ApiError.notFound("Order not found.");
  }
  const row = rows[0];

  const lines = await sql<LineRow[]>`
    SELECT id, product_id, name, unit_price::text, quantity, line_total::text, custom_instructions
    FROM order_items
    WHERE order_id = ${orderId}
    ORDER BY created_at ASC
  `;

  return {
    ...toListItem(row),
    address: row.full_address
      ? {
          fullAddress: row.full_address,
          city: row.address_city ?? "",
          state: row.address_state ?? "",
          recipientName: row.recipient_name,
          phone: row.phone,
        }
      : null,
    deliveryInstructions: row.delivery_instructions,
    deliveryOtp: row.delivery_otp ?? null,
    requireOtp: Boolean(row.require_otp),
    items: lines.map((line) => ({
      id: line.id,
      productId: line.product_id,
      name: line.name,
      unitPrice: Number(line.unit_price),
      quantity: line.quantity,
      lineTotal: Number(line.line_total),
      customInstructions: line.custom_instructions,
    })),
  };
}

export type OrderTrackingEvent = {
  status: OrderStatus;
  note: string | null;
  createdAt: string;
};

const DELIVERY_PROGRESS_PCT: Record<string, number> = {
  OFFERED: 5,
  ASSIGNED: 15,
  GOING_TO_VENDOR: 30,
  ARRIVED_AT_VENDOR: 45,
  PICKED_UP: 65,
  IN_TRANSIT: 85,
  DELIVERED: 100,
};

/** 0-100 progress for a delivery status. Pure and unit-tested. */
export function deliveryProgressPct(status: string): number {
  return DELIVERY_PROGRESS_PCT[status] ?? 0;
}

export type OrderTracking = {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  createdAt: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  vendor: { name: string; slug: string; phone: string | null };
  address: { fullAddress: string; city: string | null; state: string | null } | null;
  /** 4-digit handover code, present once the rider picks up (null before). */
  deliveryOtp: string | null;
  requireOtp: boolean;
  delivery: {
    status: string;
    riderName: string | null;
    riderPhone: string | null;
    vehicleType: string | null;
    assignedAt: string | null;
    goingToVendorAt: string | null;
    arrivedAtVendorAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    progressPct: number;
  } | null;
  items: { name: string; quantity: number; lineTotal: number }[];
  history: OrderTrackingEvent[];
};

export async function getOrderTrackingByNumber(orderNumber: string): Promise<OrderTracking | null> {
  const sql = db();
  const orders = await sql.unsafe<
    {
      id: string;
      order_number: string;
      status: OrderStatus;
      payment_status: string;
      subtotal: string;
      delivery_fee: string;
      service_fee: string;
      tax_amount: string;
      discount: string;
      total: string;
      created_at: Date;
      vendor_name: string;
      vendor_slug: string;
      vendor_phone: string | null;
      delivery_otp: string | null;
      require_otp: boolean;
      address: string | null;
      city: string | null;
      state: string | null;
    }[]
  >(
    `SELECT o.id, o.order_number, o.status, o.payment_status,
            o.subtotal::text, o.delivery_fee::text,
            COALESCE(o.service_fee, 0)::text AS service_fee,
            COALESCE(o.tax_amount, 0)::text AS tax_amount,
            o.discount::text, o.total::text, o.created_at,
            o.delivery_otp, COALESCE(o.require_otp, FALSE) AS require_otp,
            v.business_name AS vendor_name, v.slug AS vendor_slug, v.phone AS vendor_phone,
            a.full_address AS address, a.city, a.state
     FROM orders o
     JOIN vendors v ON v.id = o.vendor_id
     LEFT JOIN addresses a ON a.id = o.address_id
     WHERE lower(o.order_number) = lower($1) LIMIT 1`,
    [orderNumber],
  );
  if (orders.length === 0) return null;
  const order = orders[0];

  const [items, history, deliveries] = await Promise.all([
    sql.unsafe<{ name: string; quantity: number; line_total: string }[]>(
      `SELECT name, quantity, line_total::text FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`,
      [order.id],
    ),
    sql.unsafe<{ status: OrderStatus; note: string | null; created_at: Date }[]>(
      `SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`,
      [order.id],
    ),
    sql.unsafe<
      {
        status: string;
        rider_name: string | null;
        rider_phone: string | null;
        vehicle_type: string | null;
        assigned_at: Date | null;
        going_to_vendor_at: Date | null;
        arrived_at_vendor_at: Date | null;
        picked_up_at: Date | null;
        delivered_at: Date | null;
      }[]
    >(
      `SELECT d.status, dp.name AS rider_name,
              COALESCE(dp.phone, u.phone) AS rider_phone,
              dp.vehicle_type, d.assigned_at, d.going_to_vendor_at,
              d.arrived_at_vendor_at, d.picked_up_at, d.delivered_at
       FROM deliveries d
       JOIN delivery_partners dp ON dp.id = d.delivery_partner_id
       LEFT JOIN users u ON u.id = dp.user_id
       WHERE d.order_id = $1 AND d.status NOT IN ('FAILED','CANCELLED')
       ORDER BY d.assigned_at DESC LIMIT 1`,
      [order.id],
    ),
  ]);
  const delivery = deliveries[0];

  return {
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    createdAt: order.created_at.toISOString(),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    serviceFee: Number(order.service_fee ?? 0),
    tax: Number(order.tax_amount ?? 0),
    discount: Number(order.discount),
    total: Number(order.total),
    vendor: { name: order.vendor_name, slug: order.vendor_slug, phone: order.vendor_phone },
    address:
      order.address == null
        ? null
        : { fullAddress: order.address, city: order.city, state: order.state },
    deliveryOtp: order.delivery_otp ?? null,
    requireOtp: Boolean(order.require_otp),
    delivery: delivery
      ? {
          status: delivery.status,
          riderName: delivery.rider_name,
          riderPhone: delivery.rider_phone,
          vehicleType: delivery.vehicle_type,
          assignedAt: delivery.assigned_at?.toISOString() ?? null,
          goingToVendorAt: delivery.going_to_vendor_at?.toISOString() ?? null,
          arrivedAtVendorAt: delivery.arrived_at_vendor_at?.toISOString() ?? null,
          pickedUpAt: delivery.picked_up_at?.toISOString() ?? null,
          deliveredAt: delivery.delivered_at?.toISOString() ?? null,
          progressPct: deliveryProgressPct(delivery.status),
        }
      : null,
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      lineTotal: Number(item.line_total),
    })),
    history: history.map((event) => ({
      status: event.status,
      note: event.note,
      createdAt: event.created_at.toISOString(),
    })),
  };
}

/** Order owner's contact for tracking verification (never exposed). */
async function getTrackingOwnerContact(
  orderNumber: string,
): Promise<{ userId: string; email: string; phone: string | null } | null> {
  const sql = db();
  const rows = await sql<{ userId: string; email: string; phone: string | null }[]>`
    SELECT o.user_id::text AS "userId", u.email, u.phone
    FROM orders o JOIN users u ON u.id = o.user_id
    WHERE o.order_number = ${orderNumber} LIMIT 1
  `;
  return rows[0] ?? null;
}

function normalizeContactPhone(phone: string | null | undefined): string {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("234")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/**
 * Contact-verified order tracking. The order number alone is enumerable, so
 * full tracking (address, rider phone, handover code) requires either an
 * owning session or a matching order email/phone. Returns null otherwise —
 * callers must use the generic not-found message to avoid oracle responses.
 */
export async function getVerifiedOrderTracking(input: {
  orderNumber: string;
  sessionUserId: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<OrderTracking | null> {
  const owner = await getTrackingOwnerContact(input.orderNumber);
  if (!owner) return null;
  if (input.sessionUserId && input.sessionUserId === owner.userId) {
    return getOrderTrackingByNumber(input.orderNumber);
  }
  const emailOk =
    !!input.email && owner.email && input.email.trim().toLowerCase() === owner.email.trim().toLowerCase();
  const givenPhone = normalizeContactPhone(input.phone);
  const ownerPhone = normalizeContactPhone(owner.phone);
  const phoneOk = givenPhone.length >= 7 && ownerPhone.length >= 7 && givenPhone === ownerPhone;
  if (!emailOk && !phoneOk) return null;
  return getOrderTrackingByNumber(input.orderNumber);
}

type PaymentRow = { id: string; order_id: string; payment_reference: string; status: string; amount: string };

export async function findPaymentByReference(reference: string): Promise<PaymentRow | null> {
  const sql = db();
  const rows = await sql<PaymentRow[]>`
    SELECT id, order_id, payment_reference, status, amount::text
    FROM payments
    WHERE payment_reference = ${reference}
    LIMIT 1
  `;
  return rows.length > 0 ? rows[0] : null;
}

export type MarkPaidResult = { applied: boolean; alreadyPaid: boolean };

/**
 * Confirm an order as paid. Idempotent per reference: verify + webhook racing
 * for the same order collapse to one winner; the loser (or any replay for the
 * same reference) returns { alreadyPaid: true } instead of an error.
 *
 * Concurrency: SELECT ... FOR UPDATE serializes concurrent confirmations for
 * the same order, and the state flip itself is a conditional
 * UPDATE ... WHERE status = 'PENDING_PAYMENT' so only one worker wins even
 * without the lock. The winning Paystack reference is stored on
 * orders.paystack_reference (UNIQUE) so a reference can never confirm two
 * orders.
 */
export async function markOrderPaymentPaid(
  orderId: string,
  userId: string,
  reference?: string,
): Promise<MarkPaidResult> {
  const sql = db();
  let paidNow = false;
  let vendorUserId: string | null = null;
  let orderNumber = "";
  let orderTotal = 0;
  // No handover code at payment time: the 4-digit delivery code is issued
  // when the rider picks up the order (see issueDeliveryCode), so a code
  // shown early can never go stale before handover.
  await sql.begin(async (tx) => {
    // Locked read: a concurrent webhook/verify for the same order blocks
    // here instead of double-processing payment side effects below.
    const orders = await tx<{ id: string; user_id: string; status: string; order_number: string; total: string; vendor_id: string }[]>`
      SELECT id, user_id, status, order_number, total::text, vendor_id FROM orders WHERE id = ${orderId} LIMIT 1
      FOR UPDATE
    `;
    if (orders.length === 0) {
      throw ApiError.notFound("Order not found.");
    }
    if (orders[0].user_id !== userId) {
      throw ApiError.forbidden("You do not have access to this order.");
    }

    if (orders[0].status !== "PENDING_PAYMENT") {
      // Idempotent replay: the order already left PENDING_PAYMENT via an
      // earlier verify/webhook (or progressed further down the lifecycle).
      // Same-reference replays — and verify+webhook both arriving — are
      // success, not errors. A cancelled/expired order is the only case that
      // must NOT resurrect into PAID.
      const paidProgression = new Set([
        "PAID",
        "VENDOR_ACCEPTED",
        "CONFIRMED",
        "PREPARING",
        "READY_FOR_PICKUP",
        "RIDER_ASSIGNED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ]);
      if (paidProgression.has(orders[0].status)) return;
      throw ApiError.conflict(
        `This order is ${orders[0].status.replaceAll("_", " ")} and can no longer be paid. If you were charged, contact support with your reference.`,
      );
    }
    assertOrderTransition(orders[0].status, "PAID");

    orderNumber = orders[0].order_number;
    orderTotal = Number(orders[0].total);

    // Atomic conditional flip: only the first worker moves PENDING_PAYMENT ->
    // PAID. A race loser gets zero rows and is treated as already-paid below.
    // paystack_reference is best-effort until migration 017 lands (fallback
    // without the column keeps old deploys working during rollout).
    let flipped: { id: string }[] = [];
    if (reference) {
      try {
        flipped = await tx<{ id: string }[]>`
          UPDATE orders
          SET status = 'PAID', payment_status = 'PAID', updated_at = NOW(),
              delivery_otp = NULL, require_otp = FALSE,
              paystack_reference = COALESCE(paystack_reference, ${reference})
          WHERE id = ${orderId} AND status = 'PENDING_PAYMENT'
          RETURNING id
        `;
      } catch (error) {
        if ((error as { code?: string }).code !== "42703") throw error;
        flipped = await tx<{ id: string }[]>`
          UPDATE orders
          SET status = 'PAID', payment_status = 'PAID', updated_at = NOW(),
              delivery_otp = NULL, require_otp = FALSE
          WHERE id = ${orderId} AND status = 'PENDING_PAYMENT'
          RETURNING id
        `;
      }
    } else {
      flipped = await tx<{ id: string }[]>`
        UPDATE orders
        SET status = 'PAID', payment_status = 'PAID', updated_at = NOW(),
            delivery_otp = NULL, require_otp = FALSE
        WHERE id = ${orderId} AND status = 'PENDING_PAYMENT'
        RETURNING id
      `;
    }
    if (!flipped[0]) return;
    paidNow = true;
    await tx`
      INSERT INTO order_status_history (order_id, status) VALUES (${orderId}, 'PAID')
    `;
    if (reference) {
      await tx`
        UPDATE payments
        SET status = 'SUCCESS', paid_at = COALESCE(paid_at, NOW())
        WHERE payment_reference = ${reference}
      `;
    } else {
      await tx`
        UPDATE payments
        SET status = 'SUCCESS', paid_at = COALESCE(paid_at, NOW())
        WHERE order_id = ${orderId} AND status <> 'SUCCESS'
      `;
    }

    const lines = await tx<{ product_id: string | null }[]>`
      SELECT product_id FROM order_items WHERE order_id = ${orderId} AND product_id IS NOT NULL
    `;
    const productIds = lines.map((line) => line.product_id).filter((id): id is string => Boolean(id));
    if (productIds.length > 0) {
      await tx`
        DELETE FROM cart_items
        WHERE cart_id = (SELECT id FROM carts WHERE user_id = ${userId})
          AND product_id = ANY(${productIds})
      `;
    }

    const vendorRows = await tx<{ user_id: string }[]>`
      SELECT v.user_id
      FROM vendors v
      JOIN orders o ON o.vendor_id = v.id
      WHERE o.id = ${orderId}
      LIMIT 1
    `;
    vendorUserId = vendorRows[0]?.user_id ?? null;
  });

  if (!paidNow) {
    // Race loser or replay: re-read to report accurately without duplicate
    // side effects (no second email/vendor ping).
    try {
      const current = await sql<{ status: string }[]>`
        SELECT status FROM orders WHERE id = ${orderId} LIMIT 1
      `;
      const paidProgression = new Set([
        "PAID",
        "VENDOR_ACCEPTED",
        "CONFIRMED",
        "PREPARING",
        "READY_FOR_PICKUP",
        "RIDER_ASSIGNED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ]);
      if (current[0] && paidProgression.has(current[0].status)) {
        return { applied: false, alreadyPaid: true };
      }
    } catch {
      // fall through — caller already holds a conflict/not-found from tx
    }
    return { applied: false, alreadyPaid: true };
  }

  // Financial ledger: record the customer charge + computed split (best-effort).
  try {
    const { upsertMoneySplit, recordTransactions } = await import("./money");
    await upsertMoneySplit(orderId);
    const payRows = await sql<{ id: string }[]>`
      SELECT id FROM payments WHERE order_id = ${orderId} ORDER BY created_at DESC LIMIT 1
    `;
    await recordTransactions({
      orderId,
      paymentId: payRows[0]?.id ?? null,
      entries: [{ kind: "CHARGE", amount: orderTotal, beneficiaryType: "PLATFORM" }],
    });
  } catch {
    // never block payment confirmation on ledger writes
  }

  const ownerId = vendorUserId;

  // Customer confirmation (payment verified → PAID): in-app + templated email.
  // Same trigger as before; template/design change only (Brevo untouched).
  await notifyUser({
    userId,
    type: "ORDER",
    title: `Payment confirmed for ${orderNumber}`,
    body: `Your payment was verified. The vendor has been notified and will start preparing your order.`,
    data: { orderId, status: "PAID" },
  }).catch(() => undefined);
  try {
    const contact = await lookupContact(userId);
    if (contact.email) {
      await sendPaymentConfirmedEmail(contact.email, orderNumber, orderId, orderTotal);
    }
  } catch {
    // fail-open: never block payment confirmation on email
  }

  // Vendor receives the order the moment it becomes PAID: in-app + email
  // so a vendor who never opens the dashboard still learns about it fast.
  if (ownerId) {
    const detail = await sql<{
      customer_name: string;
      subtotal: string;
      address: string | null;
      city: string | null;
      state: string | null;
    }[]>`
      SELECT TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
             o.subtotal::text, a.full_address AS address, a.city, a.state
      FROM orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      WHERE o.id = ${orderId}
      LIMIT 1
    `;
    const lines = await sql<{ name: string; quantity: number; line_total: string }[]>`
      SELECT name, quantity, line_total::text FROM order_items WHERE order_id = ${orderId} ORDER BY created_at ASC
    `;
    const info = detail[0];
    const customerName = info?.customer_name?.trim() || "Customer";
    const items = lines.map((line) => ({
      name: line.name,
      quantity: Number(line.quantity) || 0,
      lineTotal: Number(line.line_total) || 0,
    }));
    const foodSubtotal = Number(info?.subtotal ?? orderTotal) || orderTotal;
    const address = info
      ? { fullAddress: info.address, city: info.city, state: info.state }
      : null;
    await notifyUser({
      userId: ownerId,
      type: "ORDER",
      title: `New order ${orderNumber} from ${customerName.trim().split(" ")[0] || "Customer"}`,
      body: `New paid order ${orderNumber}. Open your vendor dashboard to accept or reject it.`,
      data: { orderId, status: "PAID" },
    }).catch(() => undefined);
    try {
      const contact = await lookupContact(ownerId);
      if (contact.email) {
        await sendVendorNewOrderEmail(contact.email, {
          orderNumber,
          orderId,
          customerName,
          items,
          foodSubtotal,
          address,
        });
      }
    } catch {
      // fail-open: vendor in-app notification already fired above
    }
  }

  return { applied: true, alreadyPaid: false };
}

export type ConsumerOverview = {
  totalOrders: number;
  activeOrders: number;
  cateringBookings: number;
  upcomingCatering: number;
  totalSpend: number;
};

/** Aggregate stats for the consumer dashboard overview. Counts across all rows, not just one page. */
export async function getConsumerOverview(userId: string): Promise<ConsumerOverview> {
  const sql = db();
  const rows = await sql<{
    total_orders: string;
    active_orders: string;
    catering_bookings: string;
    upcoming_catering: string;
    total_spend: string;
  }[]>`
    SELECT
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = ${userId})::text AS total_orders,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = ${userId} AND o.status NOT IN ('DELIVERED', 'CANCELLED', 'REFUNDED'))::text AS active_orders,
      (SELECT COUNT(*) FROM catering_requests cr WHERE cr.user_id = ${userId})::text AS catering_bookings,
      (SELECT COUNT(*) FROM catering_requests cr WHERE cr.user_id = ${userId} AND cr.status IN ('SUBMITTED', 'UNDER_REVIEW', 'QUOTED', 'ACCEPTED', 'BOOKED'))::text AS upcoming_catering,
      (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.user_id = ${userId} AND o.payment_status = 'PAID' AND o.status NOT IN ('CANCELLED', 'REFUNDED'))::text AS total_spend
  `;
  const row = rows[0];
  return {
    totalOrders: Number(row?.total_orders ?? 0),
    activeOrders: Number(row?.active_orders ?? 0),
    cateringBookings: Number(row?.catering_bookings ?? 0),
    upcomingCatering: Number(row?.upcoming_catering ?? 0),
    totalSpend: Number(row?.total_spend ?? 0),
  };
}

/**
 * Give reserved stock back when an order dies before fulfilment (vendor
 * reject/cancel, customer cancel, auto-cancel, expiry). Sums the order lines
 * per product; NULL-stock (untracked) products are untouched. Best-effort
 * callers may swallow errors — a missed restore only understates stock.
 */
export async function restoreStockForOrder(orderId: string): Promise<void> {
  const sql = db();
  const lines = await sql<{ product_id: string | null; quantity: number }[]>`
    SELECT product_id, quantity FROM order_items WHERE order_id = ${orderId} AND product_id IS NOT NULL
  `;
  for (const line of lines) {
    if (!line.product_id) continue;
    await sql`
      UPDATE products SET stock_quantity = stock_quantity + ${line.quantity}, updated_at = NOW()
      WHERE id = ${line.product_id} AND stock_quantity IS NOT NULL
    `;
  }
}

/** Release one coupon redemption when a vendor rejects/cancels a discounted order. */
export async function releaseCouponForOrder(orderId: string): Promise<void> {
  const sql = db();
  const rows = await sql<{ coupon_code: string | null }[]>`
    SELECT coupon_code FROM orders WHERE id = ${orderId} LIMIT 1
  `;
  const code = rows[0]?.coupon_code?.trim();
  if (!code) return;
  await sql`
    UPDATE coupons SET used_count = GREATEST(0, used_count - 1)
    WHERE lower(code) = lower(${code})
  `;
}