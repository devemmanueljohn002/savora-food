import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderContext } from "@/server/riders";
import { notifyWithEmail } from "@/server/notify";
import { db } from "@/server/db";

const acceptSchema = z.object({
  orderId: z.string().uuid("Invalid order."),
});

type AcceptOutcome =
  | { ok: true; order: { id: string; order_number: string; user_id: string; vendor_id: string } }
  | { ok: false; reason: "NO_ORDER" | "NO_OFFER" | "OFFLINE" | "BUSY" };

/**
 * Accept a delivery job. The rider must hold a live, unexpired offer for
 * THIS order — there is no open claim. Everything (offer claim, online +
 * idle revalidation, delivery insert, order update) happens in ONE locked
 * transaction, so two simultaneous accepts cannot produce two riders.
 */
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
    const outcome = await sql.begin(async (tx): Promise<AcceptOutcome> => {
      // Lock the order row so two riders cannot accept the same job.
      const orders = await tx<{ id: string; order_number: string; user_id: string; vendor_id: string }[]>`
        SELECT id, order_number, user_id, vendor_id FROM orders
        WHERE id = ${parsed.data.orderId}
          AND status = 'READY_FOR_PICKUP'
          AND delivery_partner_id IS NULL
        FOR UPDATE
      `;
      const order = orders[0];
      if (!order) return { ok: false, reason: "NO_ORDER" };

      const existing = await tx<{ id: string }[]>`
        SELECT id FROM deliveries WHERE order_id = ${order.id} AND status NOT IN ('FAILED','CANCELLED') LIMIT 1
      `;
      if (existing[0]) return { ok: false, reason: "NO_ORDER" };

      // The offer itself is the authorization: it must be live, unexpired,
      // and addressed to THIS rider. Locked so a concurrent accept or a
      // concurrent expiry cannot both win.
      const offers = await tx<{ id: string }[]>`
        SELECT id FROM delivery_offers
        WHERE order_id = ${order.id} AND delivery_partner_id = ${rider.id}
          AND status = 'OFFERED' AND expires_at > NOW()
        ORDER BY offered_at ASC LIMIT 1
        FOR UPDATE
      `;
      const offerId = offers[0]?.id ?? null;
      if (!offerId) return { ok: false, reason: "NO_OFFER" };

      // Revalidate rider state inside the transaction (TOCTOU-safe): online
      // and idle. A stale client or script cannot stack deliveries.
      const riders = await tx<{ is_online: boolean | null }[]>`
        SELECT is_online FROM delivery_partners WHERE id = ${rider.id} FOR UPDATE
      `;
      if (riders[0]?.is_online !== true) return { ok: false, reason: "OFFLINE" };
      const trips = await tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM deliveries
        WHERE delivery_partner_id = ${rider.id}
          AND status IN ('ASSIGNED','GOING_TO_VENDOR','ARRIVED_AT_VENDOR','PICKED_UP','IN_TRANSIT')
      `;
      if (Number(trips[0]?.count ?? 0) > 0) return { ok: false, reason: "BUSY" };

      await tx`UPDATE delivery_offers SET status = 'ACCEPTED', responded_at = NOW() WHERE id = ${offerId}`;
      // Defense in depth: with single-rider offers no siblings should exist.
      await tx`UPDATE delivery_offers SET status = 'CANCELLED' WHERE order_id = ${order.id} AND status = 'OFFERED' AND id <> ${offerId}`;

      await tx`
        INSERT INTO deliveries (order_id, delivery_partner_id, offer_id, status, assigned_at)
        VALUES (${order.id}, ${rider.id}, ${offerId}, 'ASSIGNED', NOW())
      `;
      await tx`
        UPDATE orders
        SET status = 'RIDER_ASSIGNED', delivery_partner_id = ${rider.id},
            dispatch_status = 'ASSIGNED', updated_at = NOW()
        WHERE id = ${order.id}
      `;
      await tx`
        INSERT INTO order_status_history (order_id, status, note)
        VALUES (${order.id}, 'RIDER_ASSIGNED', ${`${rider.name} accepted the delivery request`})
      `;
      await tx`UPDATE delivery_partners SET last_assignment_at = NOW(), last_active_at = NOW() WHERE id = ${rider.id}`;
      return { ok: true, order };
    });

    if (!outcome.ok) {
      switch (outcome.reason) {
        case "NO_OFFER":
          throw ApiError.conflict("This offer is no longer available.");
        case "OFFLINE":
          throw ApiError.conflict("Go online to accept delivery jobs.");
        case "BUSY":
          throw ApiError.conflict("Finish your current delivery first.");
        default:
          throw ApiError.conflict("This job is no longer available.");
      }
    }
    const accepted = outcome.order;

    const vendorOwners = await sql<{ user_id: string }[]>`
      SELECT user_id FROM vendors WHERE id = ${accepted.vendor_id} LIMIT 1
    `;

    // The customer already holds the delivery code from payment confirmation;
    // it is shared verbally at handover and never exposed to the rider.
    await notifyWithEmail(accepted.user_id, {
      title: `Rider assigned to ${accepted.order_number}`,
      body: `${rider.name} accepted your delivery and is getting ready. Share your delivery code with the rider at drop-off.`,
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
