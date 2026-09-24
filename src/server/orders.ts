import { randomBytes, randomInt, timingSafeEqual } from "crypto";
import { db } from "./db";
import { ApiError } from "./errors";
import { notifyUser } from "./vendors";
import { assertPurchasable, getCartView } from "./queries/cart";
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
    a.full_address, a.city AS address_city, a.state AS address_state, a.recipient_name, a.phone
  FROM orders o
  JOIN vendors v ON v.id = o.vendor_id
  LEFT JOIN addresses a ON a.id = o.address_id
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

export async function markOrderPaymentPaid(orderId: string, userId: string): Promise<void> {
  const sql = db();
  let paidNow = false;
  let vendorUserId: string | null = null;
  let orderNumber = "";
  let orderTotal = 0;
  let deliveryOtp: string | null = null;
  let requireOtp = false;
  const otpEnabled = await getOtpEnabled().catch(() => true);
  if (otpEnabled) {
    deliveryOtp = generateDeliveryOtp();
    requireOtp = true;
  }
  await sql.begin(async (tx) => {
    const orders = await tx<{ id: string; user_id: string; status: string; order_number: string; total: string; vendor_id: string }[]>`
      SELECT id, user_id, status, order_number, total::text, vendor_id FROM orders WHERE id = ${orderId} LIMIT 1
    `;
    if (orders.length === 0) {
      throw ApiError.notFound("Order not found.");
    }
    if (orders[0].user_id !== userId) {
      throw ApiError.forbidden("You do not have access to this order.");
    }

    const alreadyPaid = orders[0].status !== "PENDING_PAYMENT";
    if (alreadyPaid) return;

    orderNumber = orders[0].order_number;
    orderTotal = Number(orders[0].total);
    paidNow = true;

    await tx`
      UPDATE orders
      SET status = 'PAID', payment_status = 'PAID', updated_at = NOW(),
          delivery_otp = ${deliveryOtp}, require_otp = ${requireOtp}
      WHERE id = ${orderId}
    `;
    await tx`
      INSERT INTO order_status_history (order_id, status) VALUES (${orderId}, 'PAID')
    `;
    await tx`
      UPDATE payments
      SET status = 'SUCCESS', paid_at = NOW()
      WHERE order_id = ${orderId} AND status <> 'SUCCESS'
    `;

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

  if (!paidNow) return;

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

  // Customer confirmation (payment verified → PAID).
  await notifyUser({
    userId,
    type: "ORDER",
    title: `Payment confirmed for ${orderNumber}`,
    body: deliveryOtp
      ? `Your payment of ₦${orderTotal.toLocaleString()} was verified. The vendor has been notified and will start preparing your order. Your delivery code is ${deliveryOtp} — share it with the rider on arrival.`
      : `Your payment of ₦${orderTotal.toLocaleString()} was verified. The vendor has been notified and will start preparing your order.`,
    data: { orderId, status: "PAID", requireOtp, hasDeliveryOtp: Boolean(deliveryOtp) },
  }).catch(() => undefined);

  // Vendor receives the order the moment it becomes PAID.
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
    const lines = await sql<{ name: string; quantity: number }[]>`
      SELECT name, quantity FROM order_items WHERE order_id = ${orderId} ORDER BY created_at ASC
    `;
    const info = detail[0];
    const customerName = info?.customer_name?.trim() || "Customer";
    const itemsText = lines.map((line) => `${line.name} × ${line.quantity}`).join("\n") || "—";
    const where = [info?.address, info?.city, info?.state].filter(Boolean).join(", ") || "No address on file";
    await notifyUser({
      userId: ownerId,
      type: "ORDER",
      title: `NEW ORDER ${orderNumber}`,
      body: [
        `Customer: ${customerName}`,
        "Items:",
        itemsText,
        `Food subtotal: ₦${Number(info?.subtotal ?? orderTotal).toLocaleString()}`,
        `Delivery address: ${where}`,
        "Accept the order to confirm, or reject it if you cannot fulfil it.",
      ].join("\n"),
      data: { orderId, status: "PAID" },
    }).catch(() => undefined);
  }
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