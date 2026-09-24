import { randomBytes } from "crypto";
import { db } from "./db";
import { roundMoney } from "./orders";

export type PayoutConfig = {
  vendorCommissionPct: number;
  riderShareOfDeliveryFeePct: number;
  platformKeepsServiceFee: boolean;
  platformKeepsTax: boolean;
};

export const DEFAULT_PAYOUT: PayoutConfig = {
  vendorCommissionPct: 10,
  riderShareOfDeliveryFeePct: 100,
  platformKeepsServiceFee: true,
  platformKeepsTax: false,
};

export function normalizePayoutConfig(value: unknown): PayoutConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_PAYOUT };
  const r = value as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  return {
    vendorCommissionPct: Math.min(num(r.vendor_commission_pct ?? r.vendorCommissionPct, 10), 100),
    riderShareOfDeliveryFeePct: Math.min(num(r.rider_share_of_delivery_fee_pct ?? r.riderShareOfDeliveryFeePct, 100), 100),
    platformKeepsServiceFee: (r.platform_keeps_service_fee ?? r.platformKeepsServiceFee) !== false,
    platformKeepsTax: (r.platform_keeps_tax ?? r.platformKeepsTax) === true,
  };
}

export async function getPayoutConfig(): Promise<PayoutConfig> {
  try {
    const rows = await db()<{ value: unknown }[]>`
      SELECT value FROM platform_settings WHERE key = 'payout_config' LIMIT 1
    `;
    if (rows.length === 0) return { ...DEFAULT_PAYOUT };
    return normalizePayoutConfig(rows[0].value);
  } catch {
    return { ...DEFAULT_PAYOUT };
  }
}

export type OrderMoney = {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
};

export type MoneySplit = {
  vendorAmount: number;
  riderAmount: number;
  platformAmount: number;
  commission: number;
};

/** Split a paid order total between vendor / rider / platform. Pure and unit-tested. */
export function computeMoneySplit(money: OrderMoney, config: PayoutConfig): MoneySplit {
  const commission = roundMoney((money.subtotal * config.vendorCommissionPct) / 100);
  const riderAmount = roundMoney((money.deliveryFee * config.riderShareOfDeliveryFeePct) / 100);
  const vendorAmount = roundMoney(money.subtotal - commission);
  const serviceToPlatform = config.platformKeepsServiceFee ? money.serviceFee : 0;
  const taxToPlatform = config.platformKeepsTax ? money.tax : 0;
  const platformAmount = roundMoney(commission + serviceToPlatform + taxToPlatform + (money.deliveryFee - riderAmount));
  return { vendorAmount, riderAmount, platformAmount, commission };
}

export function generateTxReference(prefix = "TX"): string {
  return `${prefix}-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export async function recordTransactions(input: {
  orderId: string;
  paymentId?: string | null;
  entries: { kind: string; amount: number; beneficiaryType?: string | null; beneficiaryId?: string | null; meta?: Record<string, unknown> }[];
}): Promise<void> {
  const sql = db();
  for (const entry of input.entries) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await sql`
          INSERT INTO transactions (reference, order_id, payment_id, kind, amount, currency, beneficiary_type, beneficiary_id, meta)
          VALUES (${generateTxReference()}, ${input.orderId}, ${input.paymentId ?? null}, ${entry.kind}, ${roundMoney(entry.amount)}, 'NGN', ${entry.beneficiaryType ?? null}, ${entry.beneficiaryId ?? null}, ${sql.json(JSON.parse(JSON.stringify(entry.meta ?? {})))})
        `;
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== "23505" || attempt === 4) throw error;
      }
    }
  }
}

export async function upsertMoneySplit(orderId: string): Promise<MoneySplit | null> {
  const sql = db();
  const orders = await sql<(OrderMoney & { vendor_id: string })[]>`
    SELECT subtotal, delivery_fee AS "deliveryFee", COALESCE(service_fee,0) AS "serviceFee",
           COALESCE(tax_amount,0) AS "tax", discount, total, vendor_id
    FROM orders WHERE id = ${orderId} LIMIT 1
  `;
  const order = orders[0];
  if (!order) return null;
  const config = await getPayoutConfig();
  const split = computeMoneySplit(order, config);
  await sql`
    INSERT INTO order_money_splits (order_id, food_subtotal, delivery_fee, service_fee, tax, discount, total, vendor_amount, rider_amount, platform_amount, config_snapshot)
    VALUES (${orderId}, ${order.subtotal}, ${order.deliveryFee}, ${order.serviceFee}, ${order.tax}, ${order.discount}, ${order.total}, ${split.vendorAmount}, ${split.riderAmount}, ${split.platformAmount}, ${sql.json(config)})
    ON CONFLICT (order_id) DO UPDATE SET
      food_subtotal = EXCLUDED.food_subtotal, delivery_fee = EXCLUDED.delivery_fee,
      service_fee = EXCLUDED.service_fee, tax = EXCLUDED.tax, discount = EXCLUDED.discount,
      total = EXCLUDED.total, vendor_amount = EXCLUDED.vendor_amount,
      rider_amount = EXCLUDED.rider_amount, platform_amount = EXCLUDED.platform_amount,
      config_snapshot = EXCLUDED.config_snapshot, computed_at = NOW()
  `;
  return split;
}
