import { db } from "./db";
import { generateTxReference, recordTransactions } from "./money";
import { refundPaystackTransaction } from "./payments/paystack";

export type RefundOutcome =
  | { attempted: false; reason: "no_payment" | "already_refunded" | "no_amount" }
  | { attempted: true; processed: boolean; reference: string; detail: string };

/**
 * Refund an order's successful payment through Paystack and mirror it in the
 * local ledger. Idempotent: a PROCESSED refunds row for the order short-
 * circuits retries. Never throws — failures are recorded on the refunds row
 * (status FAILED + reason) so support can follow up manually.
 */
export async function refundOrderPayment(orderId: string, reason: string): Promise<RefundOutcome> {
  const sql = db();
  try {
    const done = await sql<{ id: string }[]>`
      SELECT id FROM refunds WHERE order_id = ${orderId} AND status = 'PROCESSED' LIMIT 1
    `;
    if (done[0]) return { attempted: false, reason: "already_refunded" };

    const totals = await sql<{ total: string }[]>`
      SELECT total::text AS total FROM orders WHERE id = ${orderId} LIMIT 1
    `;
    const amount = Number(totals[0]?.total ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { attempted: false, reason: "no_amount" };
    }

    const payRows = await sql<{ id: string; payment_reference: string }[]>`
      SELECT id, payment_reference FROM payments
      WHERE order_id = ${orderId} AND status = 'SUCCESS'
      ORDER BY created_at DESC LIMIT 1
    `;
    const payment = payRows[0];
    if (!payment) return { attempted: false, reason: "no_payment" };

    const reference = generateTxReference("RF");
    await sql`
      INSERT INTO refunds (order_id, payment_id, reference, amount, reason, status)
      VALUES (${orderId}, ${payment.id}, ${reference}, ${amount}, ${reason}, 'PENDING')
    `;

    try {
      const result = await refundPaystackTransaction({ reference: payment.payment_reference });
      await sql`
        UPDATE refunds SET status = 'PROCESSED'
        WHERE order_id = ${orderId} AND reference = ${reference}
      `;
      await recordTransactions({
        orderId,
        paymentId: payment.id,
        entries: [
          {
            kind: "REFUND",
            amount,
            meta: { reference, reason, paystackStatus: result.status, paystackRefund: result.refundReference },
          },
        ],
      });
      return { attempted: true, processed: true, reference, detail: result.status };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Paystack refund failed.";
      await sql`
        UPDATE refunds SET status = 'FAILED', reason = ${`${reason} (refund failed: ${detail})`.slice(0, 500)}
        WHERE order_id = ${orderId} AND reference = ${reference}
      `.catch(() => undefined);
      return { attempted: true, processed: false, reference, detail };
    }
  } catch (error) {
    console.error("[refunds] refundOrderPayment failed:", error);
    return { attempted: false, reason: "no_payment" };
  }
}
