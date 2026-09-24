import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { pageMeta, paging, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() || "";
    const search = url.searchParams.get("search")?.trim() || "";
    const { page, pageSize, offset } = paging(url);

    const sql = db();
    const totalRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM vendors v
      WHERE ${status ? sql`v.status = ${status}` : sql`TRUE`}
        ${search ? sql`AND (v.business_name ILIKE ${`%${search}%`} OR v.email ILIKE ${`%${search}%`})` : sql``}
    `;
    const total = Number(totalRows[0]?.count ?? 0);
    const rows = await sql<{
      id: string;
      business_name: string;
      slug: string;
      owner_name: string | null;
      email: string | null;
      phone: string | null;
      city: string | null;
      status: string;
      commission_rate: string;
      rating_average: string;
      rating_count: number;
      is_featured: boolean;
      created_at: Date;
      product_count: number;
      order_count: number;
    }[]>`
      SELECT v.id, v.business_name, v.slug, v.owner_name, v.email, v.phone, v.city,
             v.status, v.commission_rate, v.rating_average, v.rating_count, v.is_featured, v.created_at,
             (SELECT COUNT(*) FROM products p WHERE p.vendor_id = v.id) AS product_count,
             (SELECT COUNT(*) FROM orders o WHERE o.vendor_id = v.id) AS order_count
      FROM vendors v
      WHERE ${status ? sql`v.status = ${status}` : sql`TRUE`}
        ${search ? sql`AND (v.business_name ILIKE ${`%${search}%`} OR v.email ILIKE ${`%${search}%`})` : sql``}
      ORDER BY v.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          businessName: row.business_name,
          slug: row.slug,
          ownerName: row.owner_name,
          email: row.email,
          phone: row.phone,
          city: row.city,
          status: row.status,
          commissionRate: Number(row.commission_rate),
          ratingAverage: Number(row.rating_average),
          ratingCount: row.rating_count,
          isFeatured: row.is_featured,
          createdAt: row.created_at,
          productCount: row.product_count,
          orderCount: row.order_count,
        })),
        pageMeta(total, page, pageSize),
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
