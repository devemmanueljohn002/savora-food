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

// ── Open board dispatch (v2: first-claim wins) ──────────────────────────────
// Replaces single-target offers: every eligible rider sees every open job.
// An order is board-visible only when ALL hold: payment PAID, status
// PREPARING or READY_FOR_PICKUP, no rider assigned, no open delivery, not
// dismissed by this rider. The pre-claim serializer NEVER exposes customer
// identity or full addresses (area/city only) — enforced here, not in UI.

/** Claimable order statuses. Everything else is invisible on the board. */
export const BOARD_STATUSES = ["PREPARING", "READY_FOR_PICKUP"] as const;

export const BOARD_MAX_ACTIVE_JOBS = 1;
export const BOARD_UNCLAIMED_MINUTES = 10;
export const BOARD_RADIUS_KM = 8;
export const BOARD_RELEASE_FLAG_THRESHOLD = 3;
export const BOARD_RELEASE_FLAG_DAYS = 7;

export type BoardConfig = {
  maxActiveJobs: number;
  unclaimedMinutes: number;
  radiusKm: number;
  escalationBonusNaira: number;
  releaseFlagThreshold: number;
};

/** Pure config resolution — unit-testable without a database. */
export function resolveBoardConfig(value: unknown): BoardConfig {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    maxActiveJobs: Math.max(1, Math.round(num(record.max_active_jobs, BOARD_MAX_ACTIVE_JOBS))),
    unclaimedMinutes: Math.max(1, Math.round(num(record.unclaimed_minutes, BOARD_UNCLAIMED_MINUTES))),
    radiusKm: num(record.board_radius_km, BOARD_RADIUS_KM),
    escalationBonusNaira: num(record.escalation_bonus_naira, 0),
    releaseFlagThreshold: Math.max(
      1,
      Math.round(num(record.release_flag_threshold, BOARD_RELEASE_FLAG_THRESHOLD)),
    ),
  };
}

export async function getBoardConfig(): Promise<BoardConfig> {
  try {
    const rows = await db()<{ value: unknown }[]>`
      SELECT value FROM platform_settings WHERE key = 'dispatch_config' LIMIT 1
    `;
    return resolveBoardConfig(rows[0]?.value);
  } catch {
    return resolveBoardConfig(null);
  }
}

export type BoardRiderState = {
  status: string;
  verification_status: string;
  is_online: boolean | null;
  active_deliveries: number;
  current_zone: string | null;
};

/** Pure eligibility gate — unit-tested. Riders over the active-job limit,
 *  offline, unverified, or suspended riders see nothing. */
export function boardEligibility(
  rider: Pick<BoardRiderState, "status" | "verification_status" | "is_online" | "active_deliveries">,
  maxActiveJobs: number,
): { eligible: boolean; reason: "unverified" | "offline" | "suspended" | "busy" | null } {
  if (rider.verification_status !== "APPROVED") return { eligible: false, reason: "unverified" };
  if (rider.status === "SUSPENDED") return { eligible: false, reason: "suspended" };
  if (rider.status !== "ACTIVE" || rider.is_online !== true)
    return { eligible: false, reason: "offline" };
  if (rider.active_deliveries >= maxActiveJobs) return { eligible: false, reason: "busy" };
  return { eligible: true, reason: null };
}

/**
 * Pure area check. A rider claims only inside their zone/city. Riders with
 * no zone set yet are allowed everywhere — otherwise every legacy rider
 * (current_zone NULL) would be locked out until onboarding captures a zone.
 */
export function boardAreaAllowed(
  riderZone: string | null,
  vendorCity: string | null,
  vendorZone: string | null,
  dropCity: string | null,
  dropZone: string | null,
): boolean {
  const zone = (riderZone ?? "").trim().toLowerCase();
  if (!zone) return true;
  const areas = [vendorCity, vendorZone, dropCity, dropZone]
    .map((v) => (v ?? "").trim().toLowerCase())
    .filter(Boolean);
  return areas.includes(zone);
}

export type BoardJob = {
  id: string;
  orderNumber: string;
  itemCount: number;
  createdAt: Date;
  ageMinutes: number;
  payout: number;
  boosted: boolean;
  vendor: { name: string; slug: string; area: string | null };
  dropArea: { city: string | null; zone: string | null };
  distanceKm: number | null;
  etaMinutes: number | null;
};

/**
 * Haversine distance in km. Pure and unit-tested. Returns null when either
 * endpoint lacks coordinates — the board has no GPS yet (see report), so
 * distance/ETA stay null until rider apps report location.
 */
export function haversineKm(
  aLat: number | null | undefined,
  aLng: number | null | undefined,
  bLat: number | null | undefined,
  bLng: number | null | undefined,
): number | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Rider payout for a board row: configured share of the fee plus any escalation bonus. */
export function boardPayout(deliveryFee: number, sharePct: number, bonus: number): number {
  const share = Math.max(0, Number(deliveryFee) || 0) * (Math.min(100, Math.max(0, sharePct)) / 100);
  return Math.round((share + Math.max(0, Number(bonus) || 0)) * 100) / 100;
}

/** Map a claim failure to the API conflict message. Pure and unit-tested. */
export function claimConflictMessage(reason: "taken" | "ineligible" | "area"): string {
  if (reason === "taken") return "Job already taken";
  if (reason === "area") return "This job is outside your delivery area.";
  return "You are not eligible for this job right now.";
}

type BoardJobRow = {
  id: string;
  order_number: string;
  delivery_fee: string;
  payout_bonus: string;
  item_count: string;
  created_at: Date;
  vendor_name: string;
  vendor_slug: string;
  vendor_city: string | null;
  vendor_zone: string | null;
  drop_city: string | null;
  drop_zone: string | null;
};

function toBoardJob(row: BoardJobRow, sharePct: number): BoardJob {
  const payout = boardPayout(Number(row.delivery_fee), sharePct, Number(row.payout_bonus));
  return {
    id: row.id,
    orderNumber: row.order_number,
    itemCount: Number(row.item_count),
    createdAt: row.created_at,
    ageMinutes: Math.max(0, Math.floor((Date.now() - row.created_at.getTime()) / 60000)),
    payout,
    boosted: Number(row.payout_bonus) > 0,
    vendor: {
      name: row.vendor_name,
      slug: row.vendor_slug,
      area: row.vendor_zone ?? row.vendor_city,
    },
    dropArea: { city: row.drop_city, zone: row.drop_zone },
    // No coordinates exist anywhere yet (zone-based v1) — null by design.
    distanceKm: null,
    etaMinutes: null,
  };
}

/** Board feed for one rider: open, undismissed, in-area jobs. Never leaks customer data. */
export async function findBoardJobs(
  rider: { id: string; current_zone: string | null },
  opts: { city?: string; page?: number; limit?: number } = {},
): Promise<{ jobs: BoardJob[]; total: number }> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.floor(opts.limit ?? 20)));
  const offset = (page - 1) * limit;
  const zone = (rider.current_zone ?? "").trim().toLowerCase();
  const city = (opts.city ?? "").trim();
  const { getRiderSharePct } = await import("./wallet");
  const sharePct = await getRiderSharePct().catch(() => 100);

  const rows = await db()<BoardJobRow[] & { total_count: string }[]>`
    SELECT o.id, o.order_number, o.delivery_fee::text AS delivery_fee,
           COALESCE(o.payout_bonus, 0)::text AS payout_bonus,
           (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::text AS item_count,
           o.created_at, v.business_name AS vendor_name, v.slug AS vendor_slug,
           v.city AS vendor_city, v.delivery_zone AS vendor_zone,
           a.city AS drop_city, a.delivery_zone AS drop_zone,
           COUNT(*) OVER()::text AS total_count
    FROM orders o
    JOIN vendors v ON v.id = o.vendor_id
    LEFT JOIN addresses a ON a.id = o.address_id
    WHERE o.status IN ('PREPARING', 'READY_FOR_PICKUP')
      AND o.payment_status = 'PAID'
      AND o.delivery_partner_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM deliveries d
        WHERE d.order_id = o.id AND d.status NOT IN ('FAILED', 'CANCELLED')
      )
      AND NOT EXISTS (
        SELECT 1 FROM rider_job_dismissals x
        WHERE x.order_id = o.id AND x.delivery_partner_id = ${rider.id}
      )
      AND (
        ${zone} = '' OR lower(COALESCE(v.city, '')) = ${zone}
        OR lower(COALESCE(v.delivery_zone, '')) = ${zone}
        OR lower(COALESCE(a.city, '')) = ${zone}
        OR lower(COALESCE(a.delivery_zone, '')) = ${zone}
      )
      ${city === "" ? db()`` : db()`AND (lower(COALESCE(a.city, '')) = lower(${city}) OR lower(COALESCE(v.city, '')) = lower(${city}))`}
    ORDER BY
      CASE WHEN ${zone} <> '' AND (
        lower(COALESCE(v.city, '')) = ${zone} OR lower(COALESCE(v.delivery_zone, '')) = ${zone}
      ) THEN 0 ELSE 1 END,
      o.created_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return { jobs: rows.map((row) => toBoardJob(row, sharePct)), total };
}

export type BoardClaimDetail = {
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  payout: number;
  vendor: { name: string; phone: string | null; address: string | null; city: string | null };
  drop: { fullAddress: string; city: string | null; state: string | null; phone: string | null };
  items: { name: string; quantity: number }[];
};

/**
 * Atomic first-claim-wins. Everything (rider revalidation, area check,
 * conditional order update, delivery insert, history) happens in ONE locked
 * transaction; losers get zero rows back. Returns full details only to the
 * winner — notifications stay in the route layer.
 */
export async function claimBoardJob(
  orderId: string,
  rider: { id: string; user_id: string; name: string; current_zone: string | null },
  maxActiveJobs: number,
): Promise<{ ok: true; detail: BoardClaimDetail } | { ok: false; reason: "taken" | "ineligible" | "area" }> {
  const sql = db();
  return sql.begin(async (tx): Promise<{ ok: true; detail: BoardClaimDetail } | { ok: false; reason: "taken" | "ineligible" | "area" }> => {
    // Lock the rider row so concurrent claims serialize on eligibility.
    const riders = await tx<{
      status: string;
      verification_status: string;
      is_online: boolean | null;
      current_zone: string | null;
    }[]>`
      SELECT status, verification_status, is_online, current_zone
      FROM delivery_partners WHERE id = ${rider.id} FOR UPDATE
    `;
    const state = riders[0];
    if (!state) return { ok: false, reason: "ineligible" };
    const trips = await tx<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM deliveries
      WHERE delivery_partner_id = ${rider.id}
        AND status IN ('ASSIGNED','GOING_TO_VENDOR','ARRIVED_AT_VENDOR','PICKED_UP','IN_TRANSIT')
    `;
    const gate = boardEligibility(
      {
        status: state.status,
        verification_status: state.verification_status,
        is_online: state.is_online,
        active_deliveries: Number(trips[0]?.count ?? 0),
      },
      maxActiveJobs,
    );
    if (!gate.eligible) return { ok: false, reason: "ineligible" };

    // Lock the order row; only unclaimed, paid, claimable orders convert.
    const orders = await tx<{
      id: string;
      order_number: string;
      status: string;
      delivery_fee: string;
      payout_bonus: string;
      vendor_id: string;
    }[]>`
      SELECT o.id, o.order_number, o.status, o.delivery_fee::text AS delivery_fee,
             COALESCE(o.payout_bonus, 0)::text AS payout_bonus, o.vendor_id
      FROM orders o
      WHERE o.id = ${orderId}
        AND o.delivery_partner_id IS NULL
        AND o.status IN ('PREPARING', 'READY_FOR_PICKUP')
        AND o.payment_status = 'PAID'
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) return { ok: false, reason: "taken" };
    const assigned = await tx<{ id: string }[]>`
      SELECT id FROM deliveries WHERE order_id = ${order.id} AND status NOT IN ('FAILED','CANCELLED') LIMIT 1
    `;
    if (assigned[0]) return { ok: false, reason: "taken" };

    // Area rule inside the transaction (vendor zone may have changed).
    const areas = await tx<{ vendor_city: string | null; vendor_zone: string | null; drop_city: string | null; drop_zone: string | null }[]>`
      SELECT v.city AS vendor_city, v.delivery_zone AS vendor_zone,
             a.city AS drop_city, a.delivery_zone AS drop_zone
      FROM orders o
      JOIN vendors v ON v.id = o.vendor_id
      LEFT JOIN addresses a ON a.id = o.address_id
      WHERE o.id = ${order.id} LIMIT 1
    `;
    const area = areas[0];
    if (
      !area ||
      !boardAreaAllowed(state.current_zone, area.vendor_city, area.vendor_zone, area.drop_city, area.drop_zone)
    ) {
      return { ok: false, reason: "area" };
    }

    // THE conditional update: exactly one concurrent claimer wins the row.
    const won = await tx<{ id: string }[]>`
      UPDATE orders
      SET status = 'RIDER_ASSIGNED', delivery_partner_id = ${rider.id},
          dispatch_status = 'ASSIGNED', updated_at = NOW()
      WHERE id = ${order.id}
        AND delivery_partner_id IS NULL
        AND status IN ('PREPARING', 'READY_FOR_PICKUP')
        AND payment_status = 'PAID'
      RETURNING id
    `;
    if (!won[0]) return { ok: false, reason: "taken" };

    const deliveries = await tx<{ id: string }[]>`
      INSERT INTO deliveries (order_id, delivery_partner_id, status, assigned_at)
      VALUES (${order.id}, ${rider.id}, 'ASSIGNED', NOW())
      RETURNING id
    `;
    await tx`
      INSERT INTO order_status_history (order_id, status, note, created_by)
      VALUES (${order.id}, 'RIDER_ASSIGNED', ${`${rider.name} claimed the job from the board`}, ${rider.user_id})
    `;
    await tx`UPDATE delivery_partners SET last_assignment_at = NOW(), last_active_at = NOW() WHERE id = ${rider.id}`;

    const full = await tx<{
      order_number: string;
      total: string;
      delivery_fee: string;
      vendor_name: string;
      vendor_phone: string | null;
      vendor_address: string | null;
      vendor_city: string | null;
      customer_name: string | null;
      drop_address: string | null;
      drop_city: string | null;
      drop_state: string | null;
      drop_phone: string | null;
      item_name: string;
      item_qty: number;
    }[]>`
      SELECT o.order_number, o.total::text AS total, o.delivery_fee::text AS delivery_fee,
             v.business_name AS vendor_name, v.phone AS vendor_phone,
             v.address AS vendor_address, v.city AS vendor_city,
             TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
             a.full_address AS drop_address, a.city AS drop_city, a.state AS drop_state,
             COALESCE(u.phone, a.phone) AS drop_phone,
             oi.name AS item_name, oi.quantity AS item_qty
      FROM orders o
      JOIN vendors v ON v.id = o.vendor_id
      JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ${order.id}
      ORDER BY oi.created_at ASC
    `;
    const head = full[0];
    const { getRiderSharePct } = await import("./wallet");
    const sharePct = await getRiderSharePct().catch(() => 100);
    return {
      ok: true,
      detail: {
        deliveryId: deliveries[0].id,
        orderId: order.id,
        orderNumber: order.order_number,
        payout: boardPayout(Number(head?.delivery_fee ?? order.delivery_fee), sharePct, Number(order.payout_bonus)),
        vendor: {
          name: head?.vendor_name ?? "",
          phone: head?.vendor_phone ?? null,
          address: head?.vendor_address ?? null,
          city: head?.vendor_city ?? null,
        },
        drop: {
          fullAddress: head?.drop_address ?? "",
          city: head?.drop_city ?? null,
          state: head?.drop_state ?? null,
          phone: head?.drop_phone ?? null,
        },
        items: full.filter((r) => r.item_name != null).map((r) => ({ name: r.item_name, quantity: r.item_qty })),
      },
    };
  });
}

/** Per-rider dismiss: hides a board job from one rider only. Idempotent. */
export async function dismissBoardJob(orderId: string, riderId: string): Promise<void> {
  await db()`
    INSERT INTO rider_job_dismissals (order_id, delivery_partner_id)
    VALUES (${orderId}, ${riderId})
    ON CONFLICT (order_id, delivery_partner_id) DO NOTHING
  `;
}

/**
 * Release a claimed job back to the board (before pickup only). The delivery
 * closes as CANCELLED (no partial fee — nothing was picked up), the order
 * reopens, and the releasing rider auto-dismisses it. Riders who release
 * repeatedly get flagged to admins.
 */
export async function releaseBoardJob(
  deliveryId: string,
  rider: { id: string; user_id: string; name: string },
  flagThreshold: number,
): Promise<{ ok: true; orderId: string } | { ok: false; reason: "not_found" | "too_late" }> {
  const sql = db();
  const outcome = await sql.begin(async (tx) => {
    const rows = await tx<{ id: string; order_id: string; order_number: string; status: string; order_status: string }[]>`
      SELECT d.id, d.order_id, o.order_number, d.status, o.status AS order_status
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      WHERE d.id = ${deliveryId} AND d.delivery_partner_id = ${rider.id}
      LIMIT 1 FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (!["ASSIGNED", "GOING_TO_VENDOR", "ARRIVED_AT_VENDOR"].includes(row.status)) {
      return { ok: false as const, reason: "too_late" as const };
    }
    if (["CANCELLED", "DELIVERED", "REFUNDED"].includes(row.order_status)) {
      return { ok: false as const, reason: "not_found" as const };
    }
    await tx`UPDATE deliveries SET status = 'CANCELLED', tracking_note = 'Released by rider before pickup' WHERE id = ${row.id}`;
    await tx`
      UPDATE orders SET status = 'READY_FOR_PICKUP', delivery_partner_id = NULL, updated_at = NOW()
      WHERE id = ${row.order_id} AND status NOT IN ('CANCELLED', 'DELIVERED', 'REFUNDED')
    `;
    await tx`
      INSERT INTO order_status_history (order_id, status, note, created_by)
      VALUES (${row.order_id}, 'READY_FOR_PICKUP', ${`${rider.name} released the job before pickup`}, ${rider.user_id})
    `;
    await tx`
      INSERT INTO rider_job_dismissals (order_id, delivery_partner_id)
      VALUES (${row.order_id}, ${rider.id})
      ON CONFLICT (order_id, delivery_partner_id) DO NOTHING
    `;
    return { ok: true as const, orderId: row.order_id, orderNumber: row.order_number };
  });
  if (!outcome.ok) return outcome;
  // Repeat-release flagging (outside the tx; best-effort, never blocks).
  try {
    const recent = await db()<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM deliveries d
      WHERE d.delivery_partner_id = ${rider.id}
        AND d.status = 'CANCELLED'
        AND d.tracking_note = 'Released by rider before pickup'
        AND d.created_at > NOW() - make_interval(days => ${BOARD_RELEASE_FLAG_DAYS})
    `;
    if (Number(recent[0]?.count ?? 0) >= flagThreshold) {
      const { notifyWithEmail } = await import("./notify");
      const admins = await db()<{ user_id: string }[]>`
        SELECT u.id AS user_id FROM users u WHERE u.role IN ('ADMIN', 'SUPER_ADMIN') LIMIT 10
      `;
      for (const admin of admins) {
        await notifyWithEmail(admin.user_id, {
          title: `Rider ${rider.name} released ${recent[0].count} jobs in ${BOARD_RELEASE_FLAG_DAYS} days`,
          body: `${rider.name} has repeatedly released claimed jobs before pickup. Please review.`,
          data: { riderId: rider.id, status: "RELEASED" },
        }).catch(() => undefined);
      }
    }
  } catch {
    // flagging must never fail the release itself
  }
  return { ok: true, orderId: outcome.orderId };
}

/**
 * Lazy unclaimed-job escalation (no cron needed — runs bounded on board
 * reads): jobs claimable longer than the configured window get flagged once
 * (escalated_at) with an optional platform-funded payout bump, and admins
 * are notified. Idempotent: escalated_at IS NULL gate + single-row updates.
 */
export async function escalateUnclaimedJobs(limit = 10): Promise<number> {
  const sql = db();
  const config = await getBoardConfig();
  const stale = await sql<{ id: string; order_number: string }[]>`
    SELECT o.id, o.order_number FROM orders o
    WHERE o.status IN ('PREPARING', 'READY_FOR_PICKUP')
      AND o.payment_status = 'PAID'
      AND o.delivery_partner_id IS NULL
      AND o.escalated_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM deliveries d
        WHERE d.order_id = o.id AND d.status NOT IN ('FAILED', 'CANCELLED')
      )
      AND GREATEST(
        o.created_at,
        COALESCE(
          (SELECT MAX(created_at) FROM order_status_history h
           WHERE h.order_id = o.id AND h.status = 'READY_FOR_PICKUP'),
          o.created_at
        )
      ) < NOW() - make_interval(mins => ${config.unclaimedMinutes})
    ORDER BY o.created_at ASC
    LIMIT ${limit}
  `;
  let escalated = 0;
  for (const order of stale) {
    try {
      const updated = await sql<{ id: string }[]>`
        UPDATE orders
        SET escalated_at = NOW(),
            payout_bonus = CASE WHEN escalated_at IS NULL THEN COALESCE(payout_bonus, 0) + ${config.escalationBonusNaira} ELSE payout_bonus END,
            updated_at = NOW()
        WHERE id = ${order.id} AND escalated_at IS NULL
        RETURNING id
      `;
      if (!updated[0]) continue;
      await sql`
        INSERT INTO order_status_history (order_id, status, note)
        VALUES (${order.id}, 'READY_FOR_PICKUP', 'Escalated: unclaimed past visibility window.')
      `;
      const { notifyWithEmail } = await import("./notify");
      const admins = await sql<{ user_id: string }[]>`
        SELECT u.id AS user_id FROM users u WHERE u.role IN ('ADMIN', 'SUPER_ADMIN') LIMIT 10
      `;
      for (const admin of admins) {
        await notifyWithEmail(admin.user_id, {
          title: `Unclaimed job: ${order.order_number}`,
          body:
            config.escalationBonusNaira > 0
              ? `${order.order_number} sat unclaimed past ${config.unclaimedMinutes} minutes. Payout boosted by ₦${config.escalationBonusNaira.toLocaleString()} to raise visibility.`
              : `${order.order_number} sat unclaimed past ${config.unclaimedMinutes} minutes. Please review.`,
          data: { orderId: order.id, status: "ESCALATED" },
        }).catch(() => undefined);
      }
      escalated += 1;
    } catch {
      // one stuck order must never block the rest
    }
  }
  return escalated;
}
