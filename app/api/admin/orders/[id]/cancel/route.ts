import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { notifyUser } from "@/server/vendors";
import { assertOrderTransition } from "@/server/order-transitions";
import { releaseCouponForOrder, restoreStockForOrder } from "@/server/orders";
import { refundOrderPayment } from "@/server/refunds";
import { db } from "@/server/db";

const bodySchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
});

/**
 * Admin force-cancel: unstick an order in any non-terminal state (e.g. a
 * PAID order a silent vendor never accepted, or anything the vendor and
 * rider flows cannot move). Voids open offers + deliveries, releases the
 * coupon, refunds a captured payment for real, and notifies everyone.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    const sql = db();
    const orders = await sql<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      user_id: string;
    }[]>`
      SELECT id, order_number, status, payment_status, user_id FROM orders WHERE id = ${id} LIMIT 1
    `;
    const order = orders[0];
    if (!order) throw ApiError.notFound("Order not found.");
    if (["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) {
      throw ApiError.conflict("This order is already closed.");
    }

    const reason = parsed.data.note ?? "Cancelled by support";
    assertOrderTransition(order.status, "CANCELLED");
    const markRefunded = order.payment_status === "PAID" || order.status !== "PENDING_PAYMENT";
    const openDeliveries = await sql<{ delivery_id: string; rider_user_id: string | null }[]>`
      SELECT d.id AS delivery_id, dp.user_id AS rider_user_id
      FROM deliveries d
      JOIN delivery_partners dp ON dp.id = d.delivery_partner_id
      WHERE d.order_id = ${id} AND d.status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')
      LIMIT 1
    `;
    const openDelivery = openDeliveries[0] ?? null;

    await sql.begin(async (tx) => {
      const updated = await tx<{ id: string }[]>`
        UPDATE orders
        SET status = 'CANCELLED', dispatch_status = 'CANCELLED',
            payment_status = ${markRefunded ? "REFUNDED" : order.payment_status},
            cancelled_at = NOW(), cancelled_reason = ${reason}, updated_at = NOW()
        WHERE id = ${id} AND status = ${order.status}
        RETURNING id
      `;
      if (updated.length === 0) {
        throw ApiError.conflict("This order changed while you were reviewing it. Please refresh.");
      }
      await tx`UPDATE delivery_offers SET status = 'CANCELLED' WHERE order_id = ${id} AND status = 'OFFERED'`;
      if (openDelivery) {
        await tx`UPDATE deliveries SET status = 'CANCELLED' WHERE id = ${openDelivery.delivery_id} AND status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')`;
      }
      await tx`
        INSERT INTO order_status_history (order_id, status, note, created_by)
        VALUES (${id}, 'CANCELLED', ${reason}, ${admin.id})
      `;
    });

    await releaseCouponForOrder(id).catch(() => undefined);
    await restoreStockForOrder(id).catch(() => undefined);
    await refundOrderPayment(id, reason);
    await notifyUser({
      userId: order.user_id,
      type: "ORDER",
      title: `Order ${order.order_number} cancelled`,
      body: `Support cancelled your order. ${markRefunded ? "Your payment will be refunded. If it does not arrive within a few days, contact support." : ""}${parsed.data.note ? ` Reason: ${parsed.data.note}` : ""}`,
      data: { orderId: id, status: "CANCELLED" },
    }).catch(() => undefined);
    if (openDelivery?.rider_user_id) {
      await notifyUser({
        userId: openDelivery.rider_user_id,
        type: "ORDER",
        title: `Order ${order.order_number} cancelled by support`,
        body: "This order was cancelled. Your delivery was closed — look out for new jobs.",
        data: { orderId: id, status: "CANCELLED" },
      }).catch(() => undefined);
    }
    await auditLog({
      userId: admin.id,
      action: "order.force_cancel",
      entityType: "order",
      entityId: id,
      meta: { from: order.status, reason },
    }).catch(() => undefined);
    return NextResponse.json(ok({ status: "CANCELLED" }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
