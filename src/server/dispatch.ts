import { createHash, randomInt } from "crypto";
import { db } from "./db";

// ── Zone-based rider dispatch (v1: no lat/lng required) ─────────────────────
// Factors: online presence, verification, zone/city match, active-trip count,
// vehicle-type match when relevant, least-recently-assigned, rating.

export type DispatchCandidate = {
  id: string;
  user_id: string;
  name: string;
  vehicle_type: string | null;
  current_zone: string | null;
  rating_average: string | number;
  last_assignment_at: Date | null;
  active_trips: number;
};

export type DispatchOrder = {
  id: string;
  order_number: string;
  vendor_id: string;
  vendor_name: string;
  city: string | null;
  delivery_zone: string | null;
  vendor_zone: string | null;
  vehicle_required: string | null;
  delivery_fee: number;
};

export const OFFER_TTL_SECONDS = 90;
export const OFFER_BATCH_SIZE = 5;

function zoneOf(order: DispatchOrder): string {
  return (order.delivery_zone || order.city || order.vendor_zone || "").trim().toLowerCase();
}

/** Pure ranking: fewer active trips first, then zone match, then oldest assignment, then rating. */
export function rankCandidates(
  candidates: DispatchCandidate[],
  order: Pick<DispatchOrder, "vehicle_required"> & { zone: string },
): DispatchCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.active_trips !== b.active_trips) return a.active_trips - b.active_trips;
    const aZone = (a.current_zone || "").trim().toLowerCase();
    const bZone = (b.current_zone || "").trim().toLowerCase();
    const aMatch = order.zone && aZone === order.zone ? 0 : 1;
    const bMatch = order.zone && bZone === order.zone ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    const aVehicle = order.vehicle_required
      ? (a.vehicle_type || "").toLowerCase() === order.vehicle_required.toLowerCase()
        ? 0
        : 1
      : 0;
    const bVehicle = order.vehicle_required
      ? (b.vehicle_type || "").toLowerCase() === order.vehicle_required.toLowerCase()
        ? 0
        : 1
      : 0;
    if (aVehicle !== bVehicle) return aVehicle - bVehicle;
    const aTime = a.last_assignment_at ? a.last_assignment_at.getTime() : 0;
    const bTime = b.last_assignment_at ? b.last_assignment_at.getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return Number(b.rating_average || 0) - Number(a.rating_average || 0);
  });
}

export async function getDispatchOrder(orderId: string): Promise<DispatchOrder | null> {
  const rows = await db()<{
    id: string;
    order_number: string;
    vendor_id: string;
    vendor_name: string;
    city: string | null;
    delivery_zone: string | null;
    vendor_zone: string | null;
    delivery_fee: string;
  }[]>`
    SELECT o.id, o.order_number, o.vendor_id, v.business_name AS vendor_name,
           a.city, a.delivery_zone, v.delivery_zone AS vendor_zone, o.delivery_fee::text
    FROM orders o
    JOIN vendors v ON v.id = o.vendor_id
    LEFT JOIN addresses a ON a.id = o.address_id
    WHERE o.id = ${orderId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    order_number: row.order_number,
    vendor_id: row.vendor_id,
    vendor_name: row.vendor_name,
    city: row.city,
    delivery_zone: row.delivery_zone,
    vendor_zone: row.vendor_zone,
    vehicle_required: null,
    delivery_fee: Number(row.delivery_fee),
  };
}

export async function findEligibleRiders(order: DispatchOrder, limit = OFFER_BATCH_SIZE): Promise<DispatchCandidate[]> {
  const zone = zoneOf(order);
  const rows = await db()<DispatchCandidate[]>`
    SELECT dp.id, dp.user_id, dp.name, dp.vehicle_type, dp.current_zone,
           dp.rating_average, dp.last_assignment_at,
           (SELECT COUNT(*) FROM deliveries d
             WHERE d.delivery_partner_id = dp.id
               AND d.status IN ('ASSIGNED','GOING_TO_VENDOR','ARRIVED_AT_VENDOR','PICKED_UP','IN_TRANSIT'))::int AS active_trips
    FROM delivery_partners dp
    WHERE dp.status = 'ACTIVE'
      AND dp.verification_status = 'APPROVED'
      AND dp.is_online = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM delivery_offers o
        WHERE o.order_id = ${order.id}
          AND o.delivery_partner_id = dp.id
          AND o.status IN ('OFFERED','ACCEPTED')
      )
    ORDER BY
      CASE WHEN ${zone} <> '' AND lower(COALESCE(dp.current_zone,'')) = ${zone} THEN 0 ELSE 1 END,
      dp.last_assignment_at NULLS FIRST
    LIMIT ${limit * 3}
  `;
  // Only offer to idle riders in v1 (one active delivery max).
  const idle = rows.filter((r) => r.active_trips === 0);
  return rankCandidates(idle, { vehicle_required: order.vehicle_required, zone }).slice(0, limit);
}

export async function createDispatchOffers(orderId: string): Promise<number> {
  const order = await getDispatchOrder(orderId);
  if (!order) return 0;
  const riders = await findEligibleRiders(order);
  const sql = db();
  const existing = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM delivery_offers
    WHERE order_id = ${orderId} AND status = 'OFFERED' AND expires_at > NOW()
  `;
  if (Number(existing[0]?.count ?? 0) > 0) return 0;
  if (riders.length === 0) return 0;
  const attemptRows = await sql<{ max_attempt: number | null }[]>`
    SELECT MAX(attempt_no) AS max_attempt FROM delivery_offers WHERE order_id = ${orderId}
  `;
  const attempt = (attemptRows[0]?.max_attempt ?? 0) + 1;
  for (const rider of riders) {
    await sql`
      INSERT INTO delivery_offers (order_id, delivery_partner_id, status, attempt_no, earnings_snapshot, expires_at, meta)
      VALUES (${orderId}, ${rider.id}, 'OFFERED', ${attempt}, ${order.delivery_fee}, NOW() + (${OFFER_TTL_SECONDS} || ' seconds')::interval, ${sql.json({ zone: zoneOf(order) })})
    `;
  }
  return riders.length;
}

export async function expireStaleOffers(): Promise<number> {
  const rows = await db()<{ order_id: string }[]>`
    UPDATE delivery_offers SET status = 'EXPIRED'
    WHERE status = 'OFFERED' AND expires_at <= NOW()
    RETURNING order_id
  `;
  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  for (const orderId of orderIds) {
    const live = await db()<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM delivery_offers
      WHERE order_id = ${orderId} AND status = 'OFFERED' AND expires_at > NOW()
    `;
    const assigned = await db()<{ id: string }[]>`
      SELECT id FROM deliveries WHERE order_id = ${orderId} AND status NOT IN ('FAILED','CANCELLED') LIMIT 1
    `;
    if (Number(live[0]?.count ?? 0) === 0 && assigned.length === 0) {
      await createDispatchOffers(orderId);
    }
  }
  return rows.length;
}

// ── Delivery OTP ──

export function generateDeliveryCode(): string {
  return String(randomInt(1000, 10000));
}

export function hashDeliveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
