import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { getOrderForUser, releaseCouponForOrder, restoreStockForOrder } from "@/server/orders";
import { refundOrderPayment } from "@/server/refunds";
import { notifyUser } from "@/server/vendors";
import { db } from "@/server/db";

const bodySchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
});

/**
 * Customer-initiated cancel. Allowed while the order is unpaid
 * (PENDING_PAYMENT) or paid-but-untouched (PAID) — once the vendor accepts,
 * cancellation is the vendor's/support's call. Paid cancels refund for real.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    const order = await getOrderForUser(user.id, id);
    if (!["PENDING_PAYMENT", "PAID"].includes(order.status)) {
      throw ApiError.conflict(
        "This order can no longer be cancelled by you. Contact support if you need help.",
      );
    }

    const wasPaid = order.status === "PAID";
    const reason = parsed.data.note ?? (wasPaid ? "Cancelled by customer" : "Cancelled before payment");
    const sql = db();
    await sql.begin(async (tx) => {
      // Guarded write: a concurrent payment/accept wins the row instead.
      const updated = await tx<{ id: string }[]>`
        UPDATE orders
        SET status = 'CANCELLED',
            dispatch_status = 'CANCELLED',
            payment_status = ${wasPaid ? "REFUNDED" : order.paymentStatus},
            cancelled_at = NOW(), cancelled_reason = ${reason}, updated_at = NOW()
        WHERE id = ${id} AND status = ${order.status}
        RETURNING id
      `;
      if (updated.length === 0) {
        throw ApiError.conflict("This order just changed. Please refresh and try again.");
      }
      await tx`
        INSERT INTO order_status_history (order_id, status, note, created_by)
        VALUES (${id}, 'CANCELLED', ${reason}, ${user.id})
      `;
    });

    await releaseCouponForOrder(id).catch(() => undefined);
    await restoreStockForOrder(id).catch(() => undefined);
    if (wasPaid) {
      await refundOrderPayment(id, reason);
      const owners = await db()<{ user_id: string; order_number: string }[]>`
        SELECT v.user_id, o.order_number FROM orders o
        JOIN vendors v ON v.id = o.vendor_id
        WHERE o.id = ${id} LIMIT 1
      `;
      if (owners[0]) {
        await notifyUser({
          userId: owners[0].user_id,
          type: "ORDER",
          title: `Order ${owners[0].order_number} cancelled by customer`,
          body: "The customer cancelled this order before preparation. A refund is on its way to them.",
          data: { orderId: id, status: "CANCELLED" },
        }).catch(() => undefined);
      }
    }
    return NextResponse.json(ok({ status: "CANCELLED", refunded: wasPaid }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
