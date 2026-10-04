import { createHash, randomInt } from "crypto";
import type { TransactionSql } from "postgres";
import { db } from "./db";

/** Transaction handle passed by postgres.js into sql.begin(). */
type Tx = TransactionSql;

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
  vendor_user_id: string | null;
  customer_user_id: string | null;
  vendor_name: string;
  city: string | null;
  delivery_zone: string | null;
  vendor_zone: string | null;
  vehicle_required: string | null;
  delivery_fee: number;
};

/** Fallbacks when dispatch_config is absent. Both are configurable without a redeploy. */
export const OFFER_TTL_SECONDS = 90;
export const MAX_DISPATCH_ATTEMPTS = 5;

export type DispatchConfig = { offerTtlSeconds: number; maxAttempts: number };

/** Per-order assignment lifecycle. CANCELLED mirrors order cancellation. */
export type DispatchStatus = "PENDING_ASSIGNMENT" | "OFFERED" | "ASSIGNED" | "UNASSIGNED" | "CANCELLED";

export type OfferStatus = "OFFERED" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";

const OFFER_TRANSITIONS: Record<OfferStatus, ReadonlySet<OfferStatus>> = {
  OFFERED: new Set(["ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]),
  ACCEPTED: new Set(),
  DECLINED: new Set(),
  EXPIRED: new Set(),
  CANCELLED: new Set(),
};

/** Single authority for offer state changes. Terminal states never move. */
export function canTransitionOffer(from: string, to: string): boolean {
  const allowed = OFFER_TRANSITIONS[from as OfferStatus];
  if (!allowed) return false;
  return allowed.has(to as OfferStatus);
}

export type DeliveryStatus =
  | "OFFERED"
  | "ASSIGNED"
  | "GOING_TO_VENDOR"
  | "ARRIVED_AT_VENDOR"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, ReadonlySet<DeliveryStatus>> = {
  OFFERED: new Set(["ASSIGNED", "CANCELLED"]),
  ASSIGNED: new Set(["GOING_TO_VENDOR", "ARRIVED_AT_VENDOR", "PICKED_UP", "FAILED", "CANCELLED"]),
  GOING_TO_VENDOR: new Set(["ARRIVED_AT_VENDOR", "PICKED_UP", "FAILED", "CANCELLED"]),
  ARRIVED_AT_VENDOR: new Set(["PICKED_UP", "FAILED", "CANCELLED"]),
  PICKED_UP: new Set(["IN_TRANSIT", "FAILED", "CANCELLED"]),
  IN_TRANSIT: new Set(["DELIVERED", "FAILED", "CANCELLED"]),
  DELIVERED: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
};

/** Single authority for delivery state changes. Terminal states never move. */
export function canTransitionDelivery(from: string, to: string): boolean {
  const allowed = DELIVERY_TRANSITIONS[from as DeliveryStatus];
  if (!allowed) return false;
  return allowed.has(to as DeliveryStatus);
}

/** Pure config resolution — unit-testable without a database. */
export function resolveDispatchConfig(value: unknown): DispatchConfig {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const ttl = Number(record.offer_ttl_seconds);
  const attempts = Number(record.max_dispatch_attempts);
  return {
    offerTtlSeconds: Number.isFinite(ttl) && ttl > 0 ? Math.round(ttl) : OFFER_TTL_SECONDS,
    maxAttempts: Number.isFinite(attempts) && attempts > 0 ? Math.round(attempts) : MAX_DISPATCH_ATTEMPTS,
  };
}

export async function getDispatchConfig(): Promise<DispatchConfig> {
  try {
    const rows = await db()<{ value: unknown }[]>`
      SELECT value FROM platform_settings WHERE key = 'dispatch_config' LIMIT 1
    `;
    return resolveDispatchConfig(rows[0]?.value);
  } catch {
    return { offerTtlSeconds: OFFER_TTL_SECONDS, maxAttempts: MAX_DISPATCH_ATTEMPTS };
  }
}

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
    vendor_user_id: string | null;
    customer_user_id: string | null;
    vendor_name: string;
    city: string | null;
    delivery_zone: string | null;
    vendor_zone: string | null;
    delivery_fee: string;
  }[]>`
    SELECT o.id, o.order_number, o.vendor_id, v.user_id AS vendor_user_id, o.user_id AS customer_user_id, v.business_name AS vendor_name,
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
    vendor_user_id: row.vendor_user_id,
    customer_user_id: row.customer_user_id,
    vendor_name: row.vendor_name,
    city: row.city,
    delivery_zone: row.delivery_zone,
    vendor_zone: row.vendor_zone,
    vehicle_required: null,
    delivery_fee: Number(row.delivery_fee),
  };
}

export async function findEligibleRiders(order: DispatchOrder, limit = 1): Promise<DispatchCandidate[]> {
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
          AND o.status IN ('OFFERED','ACCEPTED','DECLINED')
      )
    ORDER BY
      CASE WHEN ${zone} <> '' AND lower(COALESCE(dp.current_zone,'')) = ${zone} THEN 0 ELSE 1 END,
      dp.last_assignment_at NULLS FIRST
    LIMIT ${limit * 3}
  `;
  // Only offer to idle riders (one active delivery max). Riders declined for
  // this order never come back in a later round.
  const idle = rows.filter((r) => r.active_trips === 0);
  return rankCandidates(idle, { vehicle_required: order.vehicle_required, zone }).slice(0, Math.max(limit, 1));
}

/**
 * Offer the order to the single best eligible rider. Serialized per order
 * with an advisory lock; the partial unique index on live offers makes a
 * lost race a safe no-op. Returns 1 when an offer went out, else 0.
 */
export async function createDispatchOffers(orderId: string): Promise<number> {
  const sql = db();
  const config = await getDispatchConfig();
  // Set inside the transaction when THIS run newly exhausts the order.
  // Retries of an already-UNASSIGNED order never re-escalate (the vendor and
  // admins were already told once) and never duplicate the history note.
  let escalate = false;
  const offered = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`dispatch:${orderId}`}))`;
    const orders = await tx<{ status: string; dispatch_status: string }[]>`
      SELECT status, dispatch_status FROM orders WHERE id = ${orderId} LIMIT 1
    `;
    const current = orders[0];
    if (!current || current.status !== "READY_FOR_PICKUP") return 0;
    const wasUnassigned = current.dispatch_status === "UNASSIGNED";
    if (current.dispatch_status === "ASSIGNED") {
      // Stale marker from a failed delivery that released the order back.
      await tx`
        UPDATE orders SET dispatch_status = 'PENDING_ASSIGNMENT', updated_at = NOW()
        WHERE id = ${orderId}
      `;
    }
    const live = await tx<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM delivery_offers
      WHERE order_id = ${orderId} AND status = 'OFFERED' AND expires_at > NOW()
    `;
    if (Number(live[0]?.count ?? 0) > 0) return 0;
    const assigned = await tx<{ id: string }[]>`
      SELECT id FROM deliveries WHERE order_id = ${orderId} AND status NOT IN ('FAILED','CANCELLED') LIMIT 1
    `;
    if (assigned[0]) return 0;

    const attemptRows = await tx<{ max_attempt: number | null }[]>`
      SELECT MAX(attempt_no) AS max_attempt FROM delivery_offers WHERE order_id = ${orderId}
    `;
    const attempt = (attemptRows[0]?.max_attempt ?? 0) + 1;
    // UNASSIGNED orders get retried when never-offered riders appear (the
    // eligibility filter below excludes previously-offered riders), so a new
    // rider pool can still pick the order up. Escalation fires only on the
    // transition into UNASSIGNED, never on retries.
    if (attempt > config.maxAttempts && !wasUnassigned) {
      await markUnassignedTx(tx, orderId, "No rider available after maximum dispatch attempts");
      escalate = true;
      return -1;
    }

    const full = await getDispatchOrder(orderId);
    if (!full) return 0;
    const [rider] = await findEligibleRiders(full, 1);
    if (!rider) {
      if (!wasUnassigned && attempt >= config.maxAttempts) {
        await markUnassignedTx(tx, orderId, "No eligible riders after maximum dispatch attempts");
        escalate = true;
        return -1;
      }
      return 0;
    }

    try {
      await tx`
        INSERT INTO delivery_offers (order_id, delivery_partner_id, status, attempt_no, earnings_snapshot, expires_at, meta)
        VALUES (${orderId}, ${rider.id}, 'OFFERED', ${attempt}, ${full.delivery_fee}, NOW() + make_interval(secs => ${config.offerTtlSeconds}), ${tx.json({ zone: zoneOf(full) })})
      `;
    } catch (error) {
      // Lost the race (partial unique index): someone else just offered.
      if ((error as { code?: string } | null)?.code === "23505") return 0;
      throw error;
    }
    await tx`
      UPDATE orders SET dispatch_status = 'OFFERED', updated_at = NOW()
      WHERE id = ${orderId}
    `;
    return 1;
  });

  if (offered === 1) {
    // New offer: notify the rider in-app + email (best-effort, never blocks).
    try {
      const offeredTo = await sql<{ user_id: string; name: string }[]>`
        SELECT dp.user_id, dp.name FROM delivery_offers o
        JOIN delivery_partners dp ON dp.id = o.delivery_partner_id
        WHERE o.order_id = ${orderId} AND o.status = 'OFFERED' AND o.expires_at > NOW()
        ORDER BY o.offered_at DESC LIMIT 1
      `;
      if (offeredTo[0]) {
        const { notifyWithEmail } = await import("./notify");
        const full = await getDispatchOrder(orderId);
        const minutes = Math.max(1, Math.round(config.offerTtlSeconds / 60));
        await notifyWithEmail(offeredTo[0].user_id, {
          title: `New delivery request: ${full?.order_number ?? "a new order"}`,
          body: `${offeredTo[0].name}, ${full?.vendor_name ?? "a vendor"} needs a rider. Fee ₦${Number(full?.delivery_fee ?? 0).toLocaleString()}. You have about ${minutes} minute${minutes === 1 ? "" : "s"} to accept.`,
          data: { orderId, status: "OFFERED" },
        });
      }
    } catch {
      // notification failure must never fail the offer itself
    }
  }
  if (offered === -1 && escalate) {
    await escalateUnassigned(orderId).catch(() => undefined);
  }
  return offered === 1 ? 1 : 0;
}

/** Terminal escalation inside the dispatch transaction. Writes the history
 *  note only when the row actually transitions (retries are silent). */
async function markUnassignedTx(tx: Tx, orderId: string, note: string): Promise<void> {
  const updated = await tx<{ id: string }[]>`
    UPDATE orders SET dispatch_status = 'UNASSIGNED', updated_at = NOW()
    WHERE id = ${orderId} AND dispatch_status <> 'UNASSIGNED'
    RETURNING id
  `;
  if (updated.length === 0) return;
  await tx`
    INSERT INTO order_status_history (order_id, status, note)
    VALUES (${orderId}, 'READY_FOR_PICKUP', ${note})
  `;
}

/** Vendor + admin escalation when an order exhausts dispatch attempts. */
async function escalateUnassigned(orderId: string): Promise<void> {
  const full = await getDispatchOrder(orderId);
  if (!full) return;
  const { notifyWithEmail } = await import("./notify");
  const { auditLog } = await import("./admin");
  const message = {
    title: `No rider found for ${full.order_number}`,
    body: `${full.vendor_name} has an order waiting and no rider accepted after the maximum dispatch attempts. Please review.`,
    data: { orderId, status: "UNASSIGNED" },
  };
  if (full.vendor_user_id) {
    await notifyWithEmail(full.vendor_user_id, message).catch(() => undefined);
  }
  if (full.customer_user_id) {
    await notifyWithEmail(full.customer_user_id, {
      title: `Finding a rider for ${full.order_number}`,
      body: `Your order is ready and we're looking for an available rider. We'll notify you the moment one accepts. Thank you for your patience.`,
      data: { orderId, status: "UNASSIGNED" },
    }).catch(() => undefined);
  }
  const admins = await db()<{ user_id: string }[]>`
    SELECT u.id AS user_id FROM users u WHERE u.role IN ('ADMIN', 'SUPER_ADMIN') LIMIT 10
  `;
  for (const admin of admins) {
    await notifyWithEmail(admin.user_id, message).catch(() => undefined);
  }
  await auditLog({
    userId: null,
    action: "dispatch.unassigned",
    entityType: "order",
    entityId: orderId,
    meta: { orderNumber: full.order_number, vendorId: full.vendor_id },
  }).catch(() => undefined);
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
