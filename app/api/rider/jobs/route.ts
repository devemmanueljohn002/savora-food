import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderContext } from "@/server/riders";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER, ROLES.ADMIN]);
    const rider = await getRiderContext(session.id);

    // Lazy expiry: roll expired offers and escalate to the next riders (no cron needed).
    try {
      const { expireStaleOffers } = await import("@/server/dispatch");
      await expireStaleOffers();
    } catch {
      // never block the job feed on dispatch maintenance
    }

    // 1) Targeted offers for this rider (unexpired), with earnings + pickup/drop-off.
    const offers = await db()<{
      offer_id: string;
      expires_at: Date;
      earnings: string;
      id: string;
      order_number: string;
      total: string;
      delivery_fee: string;
      item_count: number;
      created_at: Date;
      vendor_name: string;
      vendor_slug: string;
      vendor_zone: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
    }[]>`
      SELECT o.id AS offer_id, o.expires_at, o.earnings_snapshot::text AS earnings,
             ord.id, ord.order_number, ord.total, ord.delivery_fee,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = ord.id) AS item_count,
             ord.created_at, v.business_name AS vendor_name, v.slug AS vendor_slug,
             COALESCE(a.delivery_zone, a.city, v.delivery_zone, v.city) AS vendor_zone,
             a.full_address AS address, a.city, a.state
      FROM delivery_offers o
      JOIN orders ord ON ord.id = o.order_id
      JOIN vendors v ON v.id = ord.vendor_id
      LEFT JOIN addresses a ON a.id = ord.address_id
      WHERE o.delivery_partner_id = ${rider.id}
        AND o.status = 'OFFERED' AND o.expires_at > NOW()
        AND ord.status = 'READY_FOR_PICKUP'
      ORDER BY o.offered_at ASC
      LIMIT 20
    `;

    // 2) Open pool fallback (no live offer yet) — same shape, no expiry.
    const pool = await db()<{
      id: string;
      order_number: string;
      total: string;
      delivery_fee: string;
      item_count: number;
      created_at: Date;
      vendor_name: string;
      vendor_slug: string;
      vendor_zone: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
    }[]>`
      SELECT ord.id, ord.order_number, ord.total, ord.delivery_fee,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = ord.id) AS item_count,
             ord.created_at, v.business_name AS vendor_name, v.slug AS vendor_slug,
             COALESCE(a.delivery_zone, a.city, v.delivery_zone, v.city) AS vendor_zone,
             a.full_address AS address, a.city, a.state
      FROM orders ord
      JOIN vendors v ON v.id = ord.vendor_id
      LEFT JOIN addresses a ON a.id = ord.address_id
      WHERE ord.status = 'READY_FOR_PICKUP'
        AND ord.delivery_partner_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM deliveries d
          WHERE d.order_id = ord.id AND d.status NOT IN ('FAILED','CANCELLED')
        )
        AND NOT EXISTS (
          SELECT 1 FROM delivery_offers o
          WHERE o.order_id = ord.id AND o.delivery_partner_id = ${rider.id} AND o.status = 'OFFERED' AND o.expires_at > NOW()
        )
      ORDER BY ord.created_at ASC
      LIMIT 30
    `;

    const items = [
      ...offers.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        total: Number(row.total),
        deliveryFee: Number(row.delivery_fee),
        earnings: Number(row.earnings),
        itemCount: row.item_count,
        createdAt: row.created_at,
        offerId: row.offer_id,
        offerExpiresAt: row.expires_at,
        offered: true,
        vendor: { name: row.vendor_name, slug: row.vendor_slug },
        pickupZone: row.vendor_zone,
        address: row.address == null ? null : { fullAddress: row.address, city: row.city, state: row.state },
      })),
      ...pool.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        total: Number(row.total),
        deliveryFee: Number(row.delivery_fee),
        earnings: Number(row.delivery_fee),
        itemCount: row.item_count,
        createdAt: row.created_at,
        offerId: null,
        offerExpiresAt: null,
        offered: false,
        vendor: { name: row.vendor_name, slug: row.vendor_slug },
        pickupZone: row.vendor_zone,
        address: row.address == null ? null : { fullAddress: row.address, city: row.city, state: row.state },
      })),
    ];

    return NextResponse.json(ok(items, { count: items.length }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
