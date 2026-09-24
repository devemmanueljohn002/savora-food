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

/** Targeted dispatch: offer to eligible riders first, broadcast as fallback. */
async function broadcastRiderJob(orderId: string, orderNumber: string, vendorName: string): Promise<void> {
  try {
    const { createDispatchOffers } = await import("@/server/dispatch");
    const offered = await createDispatchOffers(orderId);
    if (offered > 0) {
      const riders = await db()<{ user_id: string }[]>`
        SELECT dp.user_id FROM delivery_offers o
        JOIN delivery_partners dp ON dp.id = o.delivery_partner_id
        WHERE o.order_id = ${orderId} AND o.status = 'OFFERED' AND o.expires_at > NOW()
      `;
      await Promise.all(
        riders.map((rider) =>
          notifyUser({
            userId: rider.user_id,
            type: "ORDER",
            title: `DELIVERY REQUEST ${orderNumber}`,
            body: `${vendorName} has an order ready for pickup. Review earnings and tap ACCEPT before it expires.`,
            data: { orderId, status: "READY_FOR_PICKUP" },
          }).catch(() => undefined),
        ),
      );
      return;
    }
  } catch {
    // fall through to broadcast
  }
  const riders = await db()<{
    user_id: string;
  }[]>`
    SELECT dp.user_id
    FROM delivery_partners dp
    WHERE dp.status = 'ACTIVE' AND dp.verification_status = 'APPROVED' AND dp.is_online = TRUE
  `;
  await Promise.all(
    riders.map((rider) =>
      notifyUser({
        userId: rider.user_id,
        type: "ORDER",
        title: `New delivery job ${orderNumber}`,
        body: `${vendorName} has an order ready for pickup. Open your dashboard to accept it.`,
        data: { orderId, status: "READY_FOR_PICKUP" },
      }).catch(() => undefined),
    ),
  );
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
        await tx`UPDATE orders SET status = 'VENDOR_ACCEPTED', updated_at = NOW() WHERE id = ${id}`;
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
        await tx`UPDATE orders SET status = 'CANCELLED', payment_status = 'REFUNDED', cancelled_at = NOW(), cancelled_reason = ${reason}, updated_at = NOW() WHERE id = ${id}`;
        await tx`
          INSERT INTO order_status_history (order_id, status, note, created_by)
          VALUES (${id}, 'CANCELLED', ${reason}, ${session.id})
        `;
      });
      await releaseCouponForOrder(id).catch(() => undefined);
      // Refund ledger (best-effort): refunds row + REFUND transaction with reference ID.
      try {
        const { generateTxReference, recordTransactions } = await import("@/server/money");
        const totals = await sql<{ total: string }[]>`SELECT total::text AS total FROM orders WHERE id = ${id} LIMIT 1`;
        const payRows = await sql<{ id: string }[]>`SELECT id FROM payments WHERE order_id = ${id} ORDER BY created_at DESC LIMIT 1`;
        const amount = Number(totals[0]?.total ?? 0);
        if (amount > 0) {
          const reference = generateTxReference("RF");
          await sql`
            INSERT INTO refunds (order_id, payment_id, reference, amount, reason, status)
            VALUES (${id}, ${payRows[0]?.id ?? null}, ${reference}, ${amount}, ${reason}, 'PROCESSED')
            ON CONFLICT (reference) DO NOTHING
          `;
          await recordTransactions({
            orderId: id,
            paymentId: payRows[0]?.id ?? null,
            entries: [{ kind: "REFUND", amount, meta: { reference, reason } }],
          });
        }
      } catch {
        // ignore ledger failures on reject path
      }
      await notifyUser({
        userId: order.user_id,
        type: "ORDER",
        title: `Order ${order.order_number} rejected`,
        body: `${vendor.business_name} could not fulfil your order. Your payment will be refunded.${parsed.data.note ? ` Reason: ${parsed.data.note}` : ""}`,
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
        await tx`UPDATE orders SET status = ${next}, updated_at = NOW() WHERE id = ${id}`;
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
        await broadcastRiderJob(id, order.order_number, vendor.business_name);
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
    await sql.begin(async (tx) => {
      await tx`UPDATE orders SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_reason = ${reason}, updated_at = NOW() WHERE id = ${id}`;
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
    await notifyUser({
      userId: order.user_id,
      type: "ORDER",
      title: rejected ? `Order ${order.order_number} rejected` : `Order ${order.order_number} cancelled`,
      body: rejected
        ? `${vendor.business_name} could not accept your order.${parsed.data.note ? ` Reason: ${parsed.data.note}` : " You have not been charged further; contact support if you already paid."}`
        : `${vendor.business_name} cancelled your order.${parsed.data.note ? ` Reason: ${parsed.data.note}` : ""}`,
      data: { orderId: id, status: "CANCELLED", rejected },
    });
    return NextResponse.json(ok({ status: "CANCELLED" }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
