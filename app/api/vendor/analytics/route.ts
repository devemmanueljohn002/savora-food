import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const sql = db();

    const revenueByDay = await sql<{ day: string; gross: string; orders: string }[]>`
      SELECT to_char(o.created_at, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(o.total), 0) AS gross,
             COUNT(*)::text AS orders
      FROM orders o
      WHERE o.vendor_id = ${vendor.id}
        AND o.status NOT IN ('CANCELLED', 'REFUNDED', 'PENDING_PAYMENT')
        AND o.created_at > NOW() - make_interval(days => 30)
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const ordersByStatus = await sql<{ status: string; count: string }[]>`
      SELECT status, COUNT(*)::text AS count FROM orders
      WHERE vendor_id = ${vendor.id}
      GROUP BY status
    `;

    const topProducts = await sql<{
      id: string;
      name: string;
      revenue: string;
      quantity: string;
    }[]>`
      SELECT p.id, p.name,
             COALESCE(SUM(oi.line_total), 0) AS revenue,
             COALESCE(SUM(oi.quantity), 0)::text AS quantity
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.vendor_id = ${vendor.id}
        AND o.status NOT IN ('CANCELLED', 'REFUNDED', 'PENDING_PAYMENT')
        AND o.created_at > NOW() - make_interval(days => 30)
      GROUP BY p.id, p.name
      ORDER BY SUM(oi.line_total) DESC
      LIMIT 5
    `;

    const lowStock = await sql<{ id: string; name: string; stock_quantity: number }[]>`
      SELECT id, name, stock_quantity FROM products
      WHERE vendor_id = ${vendor.id} AND is_active = TRUE
      ORDER BY stock_quantity ASC
      LIMIT 5
    `;

    return NextResponse.json(
      ok({
        revenueByDay: revenueByDay.map((row) => ({
          day: row.day,
          gross: Number(row.gross),
          orders: Number(row.orders),
        })),
        ordersByStatus: ordersByStatus.map((row) => ({ status: row.status, count: Number(row.count) })),
        topProducts: topProducts.map((row) => ({
          id: row.id,
          name: row.name,
          revenue: Number(row.revenue),
          quantity: Number(row.quantity),
        })),
        lowStock,
        rating: {
          average: Number(vendor.rating_average ?? 0),
          count: vendor.rating_count ?? 0,
        },
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
