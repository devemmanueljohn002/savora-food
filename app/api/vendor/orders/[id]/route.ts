import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext, notifyUser } from "@/server/vendors";
import { db } from "@/server/db";

// Vendor-driven progression. Payment and rider handoff are owned by other actors:
// PENDING_PAYMENT -> PAID (Paystack webhook), READY_FOR_PICKUP -> OUT_FOR_DELIVERY (rider),
// OUT_FOR_DELIVERY -> DELIVERED (rider).
// A paid order must be explicitly accepted (PAID -> VENDOR_ACCEPTED) or
// rejected (PAID/VENDOR_ACCEPTED -> CANCELLED) before preparation starts.
const NEXT: Record<string, string> = {
  VENDOR_ACCEPTED: "PREPARING",
  CONFIRMED: "PREPARING",
  PREPARING: "READY_FOR_PICKUP",
};

const actionSchema = z.object({
  action: z.enum(["advance", "cancel", "accept", "reject"]),
  note: z.string().trim().max(500).optional().nullable(),
});

/**
 * Offer the ready order to the single best eligible rider. The dispatch
 * service notifies that rider (in-app + email); there is deliberately no
 * broadcast — riders can only accept a live offer addressed to them.
 */
async function offerRiderJob(orderId: string): Promise<void> {
  try {
    const { createDispatchOffers } = await import("@/server/dispatch");
    await createDispatchOffers(orderId);
  } catch {
    // dispatch failure must never fail the vendor's advance action
  }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id } = await ctx.params;
    const sql = db();

    const orders = await sql<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      currency: string;
      subtotal: string;
      delivery_fee: string;
      service_fee: string;
      tax_amount: string;
      discount: string;
      total: string;
      delivery_instructions: string | null;
      preferred_delivery_time: Date | null;
      created_at: Date;
      customer_id: string;
      customer_name: string | null;
      customer_email: string;
      customer_phone: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
    }[]>`
      SELECT o.id, o.order_number, o.status, o.payment_status, o.currency,
             o.subtotal, o.delivery_fee,
             COALESCE(o.service_fee, 0) AS service_fee,
             COALESCE(o.tax_amount, 0) AS tax_amount,
             o.discount, o.total,
             o.delivery_instructions, o.preferred_delivery_time, o.created_at,
             o.user_id AS customer_id,
             TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
             u.email AS customer_email,
             COALESCE(u.phone, a.phone) AS customer_phone,
             a.full_address AS address, a.city, a.state
      FROM orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      WHERE o.id = ${id} AND o.vendor_id = ${vendor.id}
      LIMIT 1
    `;
    const order = orders[0];
    if (!order) throw ApiError.notFound("Order not found.");

    const items = await sql<{
      id: string;
      product_id: string | null;
      name: string;
      unit_price: string;
      quantity: number;
      line_total: string;
      custom_instructions: string | null;
    }[]>`
      SELECT id, product_id, name, unit_price, quantity, line_total, custom_instructions
      FROM order_items WHERE order_id = ${id} ORDER BY created_at ASC
    `;
    const history = await sql<{ status: string; note: string | null; created_at: Date }[]>`
      SELECT status, note, created_at FROM order_status_history
      WHERE order_id = ${id} ORDER BY created_at ASC
    `;

    return NextResponse.json(
      ok({
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        paymentStatus: order.payment_status,
        currency: order.currency,
        subtotal: Number(order.subtotal),
        deliveryFee: Number(order.delivery_fee),
        serviceFee: Number(order.service_fee ?? 0),
        tax: Number(order.tax_amount ?? 0),
        discount: Number(order.discount),
        total: Number(order.total),
        deliveryInstructions: order.delivery_instructions,
        preferredDeliveryTime: order.preferred_delivery_time,
        createdAt: order.created_at,
        customer: {
          id: order.customer_id,
          name: order.customer_name || null,
          email: order.customer_email,
          phone: order.customer_phone,
        },
        address:
          order.address == null
            ? null
            : { fullAddress: order.address, city: order.city, state: order.state },
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          name: item.name,
          unitPrice: Number(item.unit_price),
          quantity: item.quantity,
          lineTotal: Number(item.line_total),
          customInstructions: item.custom_instructions,
        })),
        history: history.map((entry) => ({
          status: entry.status,
          note: entry.note,
          createdAt: entry.created_at,
        })),
        nextStatus: NEXT[order.status] ?? null,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id } = await ctx.params;
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const orders = await sql<{ id: string; status: string; user_id: string; order_number: string }[]>`
      SELECT id, status, user_id, order_number FROM orders
      WHERE id = ${id} AND vendor_id = ${vendor.id} LIMIT 1
    `;
    const order = orders[0];
    if (!order) throw ApiError.notFound("Order not found.");

    if (parsed.data.action === "accept") {
      if (order.status !== "PAID") {
        throw ApiError.conflict(
          `Only a paid order can be accepted (current status: ${order.status.replaceAll("_", " ")}).`,
        );
      }
      await sql.begin(async (tx) => {
        // Guarded write: a concurrent accept/reject wins the row; the loser
        // gets zero rows back instead of double-processing the order.
        const updated = await tx<{ id: string }[]>`
          UPDATE orders SET status = 'VENDOR_ACCEPTED', updated_at = NOW()
          WHERE id = ${id} AND status = 'PAID'
          RETURNING id
        `;
        if (updated.length === 0) {
          throw ApiError.conflict("This order changed while you were reviewing it. Please refresh.");
        }
        await tx`
          INSERT INTO order_status_history (order_id, status, note, created_by)
          VALUES (${id}, 'VENDOR_ACCEPTED', ${parsed.data.note ?? "Vendor accepted the order"}, ${session.id})
        `;
      });
      await notifyUser({
        userId: order.user_id,
        type: "ORDER",
        title: `Order ${order.order_number} accepted`,
        body: `${vendor.business_name} accepted your order and will start preparing it.`,
        data: { orderId: id, status: "VENDOR_ACCEPTED" },
      });
      return NextResponse.json(ok({ status: "VENDOR_ACCEPTED" }));
    }

    if (parsed.data.action === "reject") {
      if (!["PAID", "VENDOR_ACCEPTED"].includes(order.status)) {
        throw ApiError.conflict(
          `This order can no longer be rejected (current status: ${order.status.replaceAll("_", " ")}).`,
        );
      }
      const reason = parsed.data.note ?? "Rejected by vendor";
      const { releaseCouponForOrder } = await import("@/server/orders");
      await sql.begin(async (tx) => {
        // Guarded write: see accept above — concurrent reject/cancel loses.
        const updated = await tx<{ id: string }[]>`
          UPDATE orders SET status = 'CANCELLED', dispatch_status = 'CANCELLED', payment_status = 'REFUNDED', cancelled_at = NOW(), cancelled_reason = ${reason}, updated_at = NOW()
          WHERE id = ${id} AND status = ${order.status}
          RETURNING id
        `;
        if (updated.length === 0) {
          throw ApiError.conflict("This order changed while you were reviewing it. Please refresh.");
        }
        await tx`UPDATE delivery_offers SET status = 'CANCELLED' WHERE order_id = ${id} AND status = 'OFFERED'`;
        // Defensive: no open delivery can exist at PAID/VENDOR_ACCEPTED, but
        // void one anyway so a stale row can never resurrect this order.
        await tx`UPDATE deliveries SET status = 'CANCELLED' WHERE order_id = ${id} AND status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')`;
        await tx`
          INSERT INTO order_status_history (order_id, status, note, created_by)
          VALUES (${id}, 'CANCELLED', ${reason}, ${session.id})
        `;
      });
      await releaseCouponForOrder(id).catch(() => undefined);
      const { restoreStockForOrder } = await import("@/server/orders");
      await restoreStockForOrder(id).catch(() => undefined);
      // Real money-out refund via Paystack (best-effort, recorded in ledger).
      const { refundOrderPayment } = await import("@/server/refunds");
      const refund = await refundOrderPayment(id, reason);
      const refundLine =
        refund.attempted && refund.processed
          ? "Your payment has been refunded."
          : "Your payment will be refunded. If it does not arrive within a few days, contact support.";
      await notifyUser({
        userId: order.user_id,
        type: "ORDER",
        title: `Order ${order.order_number} rejected`,
        body: `${vendor.business_name} could not fulfil your order. ${refundLine}${parsed.data.note ? ` Reason: ${parsed.data.note}` : ""}`,
        data: { orderId: id, status: "CANCELLED" },
      });
      return NextResponse.json(ok({ status: "CANCELLED" }));
    }

    if (parsed.data.action === "advance") {
      const next = NEXT[order.status];
      if (!next) {
        throw ApiError.conflict(
          order.status === "PAID"
            ? "Accept or reject this order first."
            : `This order cannot be advanced from ${order.status.replaceAll("_", " ")}.`,
        );
      }
      await sql.begin(async (tx) => {
        // Guarded write: concurrent advances lose instead of double-logging.
        const updated = await tx<{ id: string }[]>`
          UPDATE orders SET status = ${next}, updated_at = NOW()
          WHERE id = ${id} AND status = ${order.status}
          RETURNING id
        `;
        if (updated.length === 0) {
          throw ApiError.conflict("This order changed while you were updating it. Please refresh.");
        }
        await tx`
          INSERT INTO order_status_history (order_id, status, note, created_by)
          VALUES (${id}, ${next}, ${parsed.data.note ?? `Vendor moved order to ${next.replaceAll("_", " ")}`}, ${session.id})
        `;
      });
      await notifyUser({
        userId: order.user_id,
        type: "ORDER",
        title: `Order ${order.order_number}: ${next.replaceAll("_", " ").toLowerCase()}`,
        body: `${vendor.business_name} updated your order to ${next.replaceAll("_", " ").toLowerCase()}.`,
        data: { orderId: id, status: next },
      });
      if (next === "READY_FOR_PICKUP") {
        await offerRiderJob(id);
      }
      return NextResponse.json(ok({ status: next }));
    }

    if (["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) {
      throw ApiError.conflict("This order can no longer be cancelled.");
    }
    if (["OUT_FOR_DELIVERY"].includes(order.status)) {
      throw ApiError.conflict("This order is already out for delivery and can no longer be cancelled by the vendor.");
    }
    const rejected = order.status === "PAID";
    const reason = parsed.data.note ?? (rejected ? "Rejected by vendor" : "Cancelled by vendor");
    // A live delivery may exist (cancel is allowed while RIDER_ASSIGNED).
    // Void it so a later rider action cannot resurrect this cancelled order.
    const openDeliveries = await sql<{ delivery_id: string; rider_user_id: string | null }[]>`
      SELECT d.id AS delivery_id, dp.user_id AS rider_user_id
      FROM deliveries d
      JOIN delivery_partners dp ON dp.id = d.delivery_partner_id
      WHERE d.order_id = ${id} AND d.status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')
      LIMIT 1
    `;
    const openDelivery = openDeliveries[0] ?? null;
    await sql.begin(async (tx) => {
      // Guarded write: concurrent cancel/reject loses instead of double-processing.
      const updated = await tx<{ id: string }[]>`
        UPDATE orders SET status = 'CANCELLED', dispatch_status = 'CANCELLED', cancelled_at = NOW(), cancelled_reason = ${reason}, updated_at = NOW()
        WHERE id = ${id} AND status = ${order.status}
        RETURNING id
      `;
      if (updated.length === 0) {
        throw ApiError.conflict("This order changed while you were updating it. Please refresh.");
      }
      await tx`UPDATE delivery_offers SET status = 'CANCELLED' WHERE order_id = ${id} AND status = 'OFFERED'`;
      if (openDelivery) {
        await tx`UPDATE deliveries SET status = 'CANCELLED' WHERE id = ${openDelivery.delivery_id} AND status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')`;
      }
      await tx`
        INSERT INTO order_status_history (order_id, status, note, created_by)
        VALUES (${id}, 'CANCELLED', ${reason}, ${session.id})
      `;
      const codes = await tx<{ coupon_code: string | null }[]>`
        SELECT coupon_code FROM orders WHERE id = ${id} LIMIT 1
      `;
      const code = codes[0]?.coupon_code?.trim();
      if (code) {
        await tx`
          UPDATE coupons SET used_count = GREATEST(0, used_count - 1)
          WHERE lower(code) = lower(${code})
        `;
      }
    });
    // Cancelled after payment: refund for real (best-effort, recorded).
    // Unpaid cancels have no SUCCESS payment, so this is a no-op for them.
    const { refundOrderPayment } = await import("@/server/refunds");
    await refundOrderPayment(id, reason);
    const { restoreStockForOrder } = await import("@/server/orders");
    await restoreStockForOrder(id).catch(() => undefined);
    await notifyUser({
      userId: order.user_id,
      type: "ORDER",
      title: rejected ? `Order ${order.order_number} rejected` : `Order ${order.order_number} cancelled`,
      body: rejected
        ? `${vendor.business_name} could not accept your order.${parsed.data.note ? ` Reason: ${parsed.data.note}` : " You have not been charged further; contact support if you already paid."}`
        : `${vendor.business_name} cancelled your order.${parsed.data.note ? ` Reason: ${parsed.data.note}` : ""} Your payment will be refunded. If it does not arrive within a few days, contact support.`,
      data: { orderId: id, status: "CANCELLED", rejected },
    });
    if (openDelivery?.rider_user_id) {
      await notifyUser({
        userId: openDelivery.rider_user_id,
        type: "ORDER",
        title: `Order ${order.order_number} cancelled by vendor`,
        body: "The vendor cancelled this order. Your delivery was closed — look out for new jobs.",
        data: { orderId: id, status: "CANCELLED" },
      }).catch(() => undefined);
    }
    return NextResponse.json(ok({ status: "CANCELLED" }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
