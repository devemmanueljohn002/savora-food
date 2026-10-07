import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";
import { koboToNaira } from "@/server/wallet";

/**
 * Admin dashboard data (server-guarded: ADMIN role only).
 *
 * Every number comes from a live database query:
 * - pendingVendors: PENDING + UNDER_REVIEW kitchens
 * - revenueMonth: SUM(total) of PAID and DELIVERED orders created this month
 * - platformEarningsMonth: SUM(commission_amount) of order settlements
 *   created this month (the commission rule lives in src/server/money.ts
 *   and is stored per order in order_settlements)
 * - ordersToday / paidToday: orders created since midnight
 * - activeRiders / ridersOnDelivery: online riders + open deliveries
 * - failedPayouts: FAILED Paystack withdrawals + FAILED vendor payouts
 * - payoutsNeedingAction: failed transfers, held vendor payouts,
 *   withdrawals awaiting approval
 * - recentActivity: latest audit_logs + admin_actions merged
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request);
    const sql = db();

    const adminRows = await sql<{ first_name: string | null; email: string }[]>`
      SELECT first_name, email FROM users WHERE id = ${admin.id} LIMIT 1
    `;

    const vendorCounts = await sql<{ status: string; count: string }[]>`
      SELECT status, COUNT(*)::text AS count FROM vendors GROUP BY status
    `;
    const byStatus = new Map(vendorCounts.map((row) => [row.status, Number(row.count) || 0]));
    const pendingVendors = (byStatus.get("PENDING") ?? 0) + (byStatus.get("UNDER_REVIEW") ?? 0);

    const money = await sql<{
      revenue_month: string;
      earnings_month: string;
      orders_today: string;
      paid_today: string;
    }[]>`
      SELECT
        COALESCE(
          SUM(o.total) FILTER (
            WHERE o.status IN ('PAID', 'DELIVERED')
              AND o.created_at >= date_trunc('month', NOW())
          ), 0
        ) AS revenue_month,
        COALESCE(
          (SELECT SUM(s.commission_amount)
           FROM order_settlements s
           WHERE s.created_at >= date_trunc('month', NOW())), 0
        ) AS earnings_month,
        COUNT(*) FILTER (WHERE o.created_at >= date_trunc('day', NOW()))::text AS orders_today,
        COUNT(*) FILTER (
          WHERE o.created_at >= date_trunc('day', NOW())
            AND o.status IN ('PAID', 'DELIVERED')
        )::text AS paid_today
      FROM orders o
    `;

    const riderStats = await sql<{ active: string; on_delivery: string }[]>`
      SELECT
        (SELECT COUNT(*)::text FROM delivery_partners WHERE status = 'ACTIVE' AND is_online = TRUE) AS active,
        (SELECT COUNT(DISTINCT delivery_partner_id)::text FROM deliveries
         WHERE delivery_partner_id IS NOT NULL
           AND status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')) AS on_delivery
    `;

    const failedWithdrawals = await sql<{
      id: string;
      owner_type: string;
      owner_name: string;
      amount_kobo: string;
      reference: string;
      failure_reason: string | null;
      created_at: Date;
    }[]>`
      SELECT w.id, w.owner_type,
             CASE w.owner_type
               WHEN 'VENDOR' THEN COALESCE(v.business_name, 'Vendor')
               WHEN 'RIDER' THEN COALESCE(r.name, 'Rider')
               ELSE w.owner_type
             END AS owner_name,
             w.amount_kobo::text AS amount_kobo, w.reference, w.failure_reason, w.created_at
      FROM withdrawals w
      LEFT JOIN vendors v ON w.owner_type = 'VENDOR' AND v.id = w.owner_id
      LEFT JOIN delivery_partners r ON w.owner_type = 'RIDER' AND r.id = w.owner_id
      WHERE w.status = 'FAILED'
      ORDER BY w.created_at DESC
      LIMIT 5
    `;

    const heldPayouts = await sql<{
      id: string;
      vendor_name: string;
      reference: string;
      net_amount: string;
      status: string;
      created_at: Date;
    }[]>`
      SELECT p.id, v.business_name AS vendor_name, p.reference,
             p.net_amount, p.status, p.created_at
      FROM vendor_payouts p
      JOIN vendors v ON v.id = p.vendor_id
      WHERE p.status IN ('PENDING', 'PROCESSING', 'FAILED')
      ORDER BY p.created_at DESC
      LIMIT 5
    `;

    const pendingWithdrawals = await sql<{
      id: string;
      owner_type: string;
      owner_name: string;
      amount_kobo: string;
      created_at: Date;
    }[]>`
      SELECT w.id, w.owner_type,
             CASE w.owner_type
               WHEN 'VENDOR' THEN COALESCE(v.business_name, 'Vendor')
               WHEN 'RIDER' THEN COALESCE(r.name, 'Rider')
               ELSE w.owner_type
             END AS owner_name,
             w.amount_kobo::text AS amount_kobo, w.created_at
      FROM withdrawals w
      LEFT JOIN vendors v ON w.owner_type = 'VENDOR' AND v.id = w.owner_id
      LEFT JOIN delivery_partners r ON w.owner_type = 'RIDER' AND r.id = w.owner_id
      WHERE w.status IN ('PENDING', 'OTP')
      ORDER BY w.created_at DESC
      LIMIT 5
    `;

    const failedPayoutRows = await sql<{ count: string }[]>`
      SELECT (
        (SELECT COUNT(*) FROM withdrawals WHERE status = 'FAILED') +
        (SELECT COUNT(*) FROM vendor_payouts WHERE status = 'FAILED')
      )::text AS count
    `;

    const auditRows = await sql<{
      id: string;
      action: string;
      entity_type: string | null;
      actor_email: string | null;
      created_at: Date;
    }[]>`
      SELECT a.id, a.action, a.entity_type, u.email AS actor_email, a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 8
    `;

    const moderationRows = await sql<{
      id: string;
      action: string;
      vendor_name: string;
      actor_email: string | null;
      created_at: Date;
    }[]>`
      SELECT a.id, a.action, v.business_name AS vendor_name, u.email AS actor_email, a.created_at
      FROM admin_actions a
      JOIN vendors v ON v.id = a.vendor_id
      LEFT JOIN users u ON u.id = a.admin_id
      ORDER BY a.created_at DESC
      LIMIT 8
    `;

    type ActivityItem = {
      id: string;
      text: string;
      detail: string;
      createdAt: Date;
    };
    const activity: ActivityItem[] = [
      ...moderationRows.map((row) => ({
        id: `mod-${row.id}`,
        text: `${row.action.toLowerCase()} ${row.vendor_name}`,
        detail: row.actor_email ?? "admin",
        createdAt: row.created_at,
      })),
      ...auditRows.map((row) => ({
        id: `audit-${row.id}`,
        text: row.action.replaceAll(".", " ").replaceAll("_", " "),
        detail: [row.actor_email, row.entity_type].filter(Boolean).join(" · ") || "system",
        createdAt: row.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);

    return NextResponse.json(
      ok({
        admin: {
          firstName: adminRows[0]?.first_name || null,
          email: adminRows[0]?.email ?? admin.email,
        },
        stats: {
          pendingVendors,
          revenueMonth: Number(money[0]?.revenue_month ?? 0),
          platformEarningsMonth: Number(money[0]?.earnings_month ?? 0),
          ordersToday: Number(money[0]?.orders_today ?? 0),
          paidToday: Number(money[0]?.paid_today ?? 0),
          activeRiders: Number(riderStats[0]?.active ?? 0),
          ridersOnDelivery: Number(riderStats[0]?.on_delivery ?? 0),
          failedPayouts: Number(failedPayoutRows[0]?.count ?? 0),
        },
        payoutsNeedingAction: {
          failedWithdrawals: failedWithdrawals.map((row) => ({
            id: row.id,
            ownerType: row.owner_type,
            ownerName: row.owner_name,
            amount: koboToNaira(Number(row.amount_kobo)),
            reference: row.reference,
            failureReason: row.failure_reason,
            createdAt: row.created_at,
          })),
          heldPayouts: heldPayouts.map((row) => ({
            id: row.id,
            vendorName: row.vendor_name,
            reference: row.reference,
            net: Number(row.net_amount),
            status: row.status,
            createdAt: row.created_at,
          })),
          pendingWithdrawals: pendingWithdrawals.map((row) => ({
            id: row.id,
            ownerType: row.owner_type,
            ownerName: row.owner_name,
            amount: koboToNaira(Number(row.amount_kobo)),
            createdAt: row.created_at,
          })),
        },
        recentActivity: activity,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
