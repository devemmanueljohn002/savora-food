import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireSuperAdmin } from "@/server/auth/guard";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const sql = db();

    const gmv = await sql<{
      day: string;
      gross: string;
      orders: string;
      commission: string;
    }[]>`
      SELECT to_char(o.created_at, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(o.total), 0) AS gross,
             COUNT(*)::text AS orders,
             COALESCE(SUM(o.total * v.commission_rate / 100), 0) AS commission
      FROM orders o
      JOIN vendors v ON v.id = o.vendor_id
      WHERE o.status NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT')
        AND o.created_at > NOW() - make_interval(days => 90)
      GROUP BY 1 ORDER BY 1 ASC
    `;

    const topVendors = await sql<{
      id: string;
      business_name: string;
      slug: string;
      gross: string;
      orders: string;
    }[]>`
      SELECT v.id, v.business_name, v.slug,
             COALESCE(SUM(o.total), 0) AS gross,
             COUNT(*)::text AS orders
      FROM orders o
      JOIN vendors v ON v.id = o.vendor_id
      WHERE o.status NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT')
        AND o.created_at > NOW() - make_interval(days => 30)
      GROUP BY v.id, v.business_name, v.slug
      ORDER BY SUM(o.total) DESC
      LIMIT 10
    `;

    const topCategories = await sql<{
      name: string;
      gross: string;
      orders: string;
    }[]>`
      SELECT COALESCE(c.name, 'Uncategorized') AS name,
             COALESCE(SUM(oi.line_total), 0) AS gross,
             COUNT(*)::text AS orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE o.status NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT')
        AND o.created_at > NOW() - make_interval(days => 30)
      GROUP BY 1 ORDER BY SUM(oi.line_total) DESC
      LIMIT 10
    `;

    const growth = await sql<{ week: string; users: string; vendors: string }[]>`
      SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
             COUNT(*) FILTER (WHERE role = 'CUSTOMER')::text AS users,
             COUNT(*) FILTER (WHERE role = 'VENDOR')::text AS vendors
      FROM users
      WHERE created_at > NOW() - make_interval(days => 84)
      GROUP BY 1 ORDER BY 1 ASC
    `;

    const catering = await sql<{ status: string; count: string }[]>`
      SELECT status, COUNT(*)::text AS count FROM catering_requests GROUP BY status
    `;

    return NextResponse.json(
      ok({
        gmvByDay: gmv.map((row) => ({
          day: row.day,
          gross: Number(row.gross),
          orders: Number(row.orders),
          commission: Number(row.commission),
        })),
        topVendors: topVendors.map((row) => ({
          id: row.id,
          businessName: row.business_name,
          slug: row.slug,
          gross: Number(row.gross),
          orders: Number(row.orders),
        })),
        topCategories: topCategories.map((row) => ({
          name: row.name,
          gross: Number(row.gross),
          orders: Number(row.orders),
        })),
        userGrowth: growth.map((row) => ({
          week: row.week,
          customers: Number(row.users),
          vendors: Number(row.vendors),
        })),
        cateringByStatus: catering.map((row) => ({ status: row.status, count: Number(row.count) })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
