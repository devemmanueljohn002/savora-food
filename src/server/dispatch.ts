import { createHash, randomBytes } from "crypto";
import type { TransactionSql } from "postgres";
import { db } from "./db";
import { assertOrderTransition } from "./order-transitions";

/** Transaction handle passed by postgres.js into sql.begin(). */
type Tx = TransactionSql;

// NOTE: single-target offers were retired in favor of the open board
// (see below). Offer-era helpers were deleted; the delivery_offers table
// remains for history only.

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



export function hashDeliveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Salted handover-code hash (`v1$salt$digest`, per-order 128-bit salt).
 * Unsalted SHA-256 over 4 digits is rainbow-trivial on DB read; new codes
 * are minted salted while legacy rows keep verifying via hashDeliveryCode.
 */
export function newDeliveryCodeSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashDeliveryCodeSalted(code: string, salt: string): string {
  return `v1$${salt}$${createHash("sha256").update(salt + code.trim()).digest("hex")}`;
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

export function toBoardJob(row: BoardJobRow, sharePct: number): BoardJob {
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
    try {
      assertOrderTransition(order.status, "RIDER_ASSIGNED");
    } catch {
      return { ok: false, reason: "taken" };
    }
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
    try {
      assertOrderTransition(row.order_status, "READY_FOR_PICKUP");
    } catch {
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
