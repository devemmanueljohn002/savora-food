import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { issueDeliveryCode } from "@/server/orders";
import { notifyWithEmail } from "@/server/notify";
import { db } from "@/server/db";

/**
 * Admin override for the delivery-code handshake: when a rider exhausts all
 * wrong-code attempts the code locks and only support can re-issue it.
 * Generates a fresh code, resets the attempt counter and notifies the
 * customer. The fresh code is returned so support can read it out when the
 * customer cannot access tracking.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const orders = await db()<{
      id: string;
      order_number: string;
      status: string;
      user_id: string;
      delivery_id: string | null;
      delivery_status: string | null;
    }[]>`
      SELECT o.id, o.order_number, o.status, o.user_id,
             d.id AS delivery_id, d.status AS delivery_status
      FROM orders o
      LEFT JOIN deliveries d ON d.order_id = o.id AND d.status NOT IN ('FAILED', 'CANCELLED')
      WHERE o.id = ${id}
      LIMIT 1
    `;
    const order = orders[0];
    if (!order) throw ApiError.notFound("Order not found.");
    if (!order.delivery_id) {
      throw ApiError.conflict("This order has no open delivery to re-issue a code for.");
    }
    if (["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) {
      throw ApiError.conflict("This order is already closed.");
    }

    const code = await issueDeliveryCode(order.id);
    await notifyWithEmail(order.user_id, {
      title: `New delivery code for ${order.order_number}`,
      body: code
        ? `Support re-issued your delivery code: ${code}. Share it with your rider on arrival.`
        : `${order.order_number} no longer needs a delivery code. Your rider can complete the delivery.`,
      data: { orderId: order.id, status: order.status },
    });
    await auditLog({
      userId: admin.id,
      action: "delivery-code.reissue",
      entityType: "order",
      entityId: order.id,
      meta: { orderNumber: order.order_number },
    });
    return NextResponse.json(ok({ reset: true, deliveryCode: code }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
