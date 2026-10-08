import { db } from "@/server/db";
import { markOrderPaymentPaid, toKobo } from "@/server/orders";
import { verifyPaystackReference } from "@/server/payments/paystack";

export type ReconcileResult = {
  checked: number;
  confirmed: number;
  skipped: string[];
};

/**
 * Shared reconcile core used by the admin endpoint, the cron route and the
 * `db:reconcile` script. Re-verifies Paystack server-side (status + reference
 * + currency + amount) before flipping via the atomic markOrderPaymentPaid path.
 */
export async function reconcileStuckPayments(
  input: { limit?: number; reference?: string; dryRun?: boolean } = {},
): Promise<ReconcileResult> {
  const sql = db();
  const limit = input.limit && Number.isFinite(input.limit) && input.limit > 0 ? Math.floor(input.limit) : 50;
  const rows = await sql<
    { order_id: string; order_number: string; user_id: string; total: string; currency: string; reference: string }[]
  >`
    SELECT o.id AS order_id, o.order_number, o.user_id, o.total::text, o.currency,
           p.payment_reference AS reference
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    WHERE o.status = 'PENDING_PAYMENT'
      AND p.status <> 'FAILED'
      ${input.reference ? sql`AND p.payment_reference = ${input.reference}` : sql``}
    ORDER BY o.created_at ASC
    LIMIT ${limit}
  `;

  const skipped: string[] = [];
  let confirmed = 0;

  for (const row of rows) {
    let verified: Awaited<ReturnType<typeof verifyPaystackReference>> | null = null;
    try {
      verified = await verifyPaystackReference(row.reference);
    } catch (error) {
      skipped.push(`${row.order_number}: verify call failed`);
      console.error(`[reconcile] verify call failed for ${row.reference}:`, error);
      continue;
    }
    const { paystackMismatchReason } = await import("@/server/payments/paystack");
    const mismatch = paystackMismatchReason(verified, {
      reference: row.reference,
      amountKobo: toKobo(Number(row.total)),
      currency: row.currency ?? "NGN",
    });
    if (mismatch) {
      skipped.push(`${row.order_number}: ${mismatch}`);
      continue;
    }
    if (input.dryRun) {
      confirmed += 1;
      continue;
    }
    try {
      await markOrderPaymentPaid(row.order_id, row.user_id, row.reference);
      confirmed += 1;
    } catch (error) {
      skipped.push(`${row.order_number}: Paystack success but order update failed`);
      console.error(`[reconcile] Paystack success but order update failed for ${row.reference}:`, error);
    }
  }

  return { checked: rows.length, confirmed, skipped };
}
