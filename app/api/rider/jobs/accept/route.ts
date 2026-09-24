import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderContext } from "@/server/riders";
import { generateDeliveryCode, hashDeliveryCode } from "@/server/dispatch";
import { notifyWithEmail } from "@/server/notify";
import { db } from "@/server/db";

const acceptSchema = z.object({
  orderId: z.string().uuid("Invalid order."),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER, ROLES.ADMIN]);
    const rider = await getRiderContext(session.id);
    if (rider.status !== "ACTIVE") {
      throw ApiError.forbidden("Go online to accept delivery jobs.");
    }
    const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const code = generateDeliveryCode();
    const accepted = await sql.begin(async (tx) => {
      // Lock the order row so two riders cannot accept the same job.
      const orders = await tx<{ id: string; order_number: string; user_id: string; vendor_id: string }[]>`
        SELECT id, order_number, user_id, vendor_id FROM orders
        WHERE id = ${parsed.data.orderId}
          AND status = 'READY_FOR_PICKUP'
          AND delivery_partner_id IS NULL
        FOR UPDATE
      `;
      const order = orders[0];
      if (!order) return null;

      const existing = await tx<{ id: string }[]>`
        SELECT id FROM deliveries WHERE order_id = ${order.id} AND status NOT IN ('FAILED','CANCELLED') LIMIT 1
      `;
      if (existing[0]) return null;

      // Claim this rider's live offer if present (decline path writes DECLINED separately).
      const offers = await tx<{ id: string }[]>`
        SELECT id FROM delivery_offers
        WHERE order_id = ${order.id} AND delivery_partner_id = ${rider.id}
          AND status = 'OFFERED' AND expires_at > NOW()
        ORDER BY offered_at ASC LIMIT 1
      `;
      const offerId: string | null = offers[0]?.id ?? null;
      if (offerId) {
        await tx`UPDATE delivery_offers SET status = 'ACCEPTED', responded_at = NOW() WHERE id = ${offerId}`;
        // Cancel sibling offers for this order.
        await tx`UPDATE delivery_offers SET status = 'CANCELLED' WHERE order_id = ${order.id} AND status = 'OFFERED' AND id <> ${offerId}`;
      }

      await tx`
        INSERT INTO deliveries (order_id, delivery_partner_id, offer_id, status, assigned_at, delivery_code_hash)
        VALUES (${order.id}, ${rider.id}, ${offerId}, 'ASSIGNED', NOW(), ${hashDeliveryCode(code)})
      `;
      await tx`
        UPDATE orders SET status = 'RIDER_ASSIGNED', delivery_partner_id = ${rider.id}, updated_at = NOW()
        WHERE id = ${order.id}
      `;
      await tx`
        INSERT INTO order_status_history (order_id, status, note)
        VALUES (${order.id}, 'RIDER_ASSIGNED', ${`${rider.name} accepted the delivery request`})
      `;
      await tx`UPDATE delivery_partners SET last_assignment_at = NOW(), last_active_at = NOW() WHERE id = ${rider.id}`;
      return order;
    });

    if (!accepted) {
      throw ApiError.conflict("This job is no longer available.");
    }

    const vendorOwners = await sql<{ user_id: string }[]>`
      SELECT user_id FROM vendors WHERE id = ${accepted.vendor_id} LIMIT 1
    `;

    // Customer: rider assigned + delivery code (shown again at drop-off).
    await notifyWithEmail(accepted.user_id, {
      title: `Rider assigned to ${accepted.order_number}`,
      body: `${rider.name} accepted your delivery and is getting ready. Your delivery code is ${code} — share it with the rider at drop-off.`,
      data: { orderId: accepted.id, status: "RIDER_ASSIGNED" },
    });
    if (vendorOwners[0]) {
      await notifyWithEmail(vendorOwners[0].user_id, {
        title: `Rider assigned: ${accepted.order_number}`,
        body: `${rider.name} accepted the delivery and is heading to your kitchen.`,
        data: { orderId: accepted.id, status: "RIDER_ASSIGNED" },
      });
    }

    return NextResponse.json(ok({ deliveryId: accepted.id, orderId: accepted.id }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
