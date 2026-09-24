import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const sql = db();

    const users = await sql<{ role: string; count: string }[]>`
      SELECT role, COUNT(*)::text AS count FROM users GROUP BY role
    `;
    const vendors = await sql<{ status: string; count: string }[]>`
      SELECT status, COUNT(*)::text AS count FROM vendors GROUP BY status
    `;
    const riders = await sql<{ verification_status: string; count: string }[]>`
      SELECT verification_status, COUNT(*)::text AS count FROM delivery_partners GROUP BY verification_status
    `;
    const orders = await sql<{
      today_orders: string;
      today_gross: string;
      gross_30d: string;
      orders_30d: string;
      open_catering: string;
    }[]>`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - make_interval(hours => 24))::text AS today_orders,
        COALESCE(SUM(total) FILTER (WHERE created_at > NOW() - make_interval(hours => 24) AND status NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT')), 0) AS today_gross,
        COALESCE(SUM(total) FILTER (WHERE created_at > NOW() - make_interval(days => 30) AND status NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT')), 0) AS gross_30d,
        COUNT(*) FILTER (WHERE created_at > NOW() - make_interval(days => 30))::text AS orders_30d,
        (SELECT COUNT(*)::text FROM catering_requests WHERE status IN ('SUBMITTED','UNDER_REVIEW')) AS open_catering
      FROM orders
    `;
    const revenueByDay = await sql<{ day: string; gross: string }[]>`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COALESCE(SUM(total), 0) AS gross
      FROM orders
      WHERE status NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT')
        AND created_at > NOW() - make_interval(days => 14)
      GROUP BY 1 ORDER BY 1 ASC
    `;
    const recentOrders = await sql<{
      id: string;
      order_number: string;
      status: string;
      total: string;
      created_at: Date;
      vendor_name: string;
    }[]>`
      SELECT o.id, o.order_number, o.status, o.total, o.created_at, v.business_name AS vendor_name
      FROM orders o JOIN vendors v ON v.id = o.vendor_id
      ORDER BY o.created_at DESC LIMIT 8
    `;

    return NextResponse.json(
      ok({
        usersByRole: users.map((row) => ({ role: row.role, count: Number(row.count) })),
        vendorsByStatus: vendors.map((row) => ({ status: row.status, count: Number(row.count) })),
        ridersByVerification: riders.map((row) => ({ status: row.verification_status, count: Number(row.count) })),
        today: { orders: Number(orders[0]?.today_orders ?? 0), gross: Number(orders[0]?.today_gross ?? 0) },
        last30Days: { orders: Number(orders[0]?.orders_30d ?? 0), gross: Number(orders[0]?.gross_30d ?? 0) },
        openCatering: Number(orders[0]?.open_catering ?? 0),
        revenueByDay: revenueByDay.map((row) => ({ day: row.day, gross: Number(row.gross) })),
        recentOrders: recentOrders.map((row) => ({
          id: row.id,
          orderNumber: row.order_number,
          status: row.status,
          total: Number(row.total),
          createdAt: row.created_at,
          vendorName: row.vendor_name,
        })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
