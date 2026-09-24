import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { pageMeta, paging, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() || "";
    const { page, pageSize, offset } = paging(url);

    const sql = db();
    const totalRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM products p
      WHERE ${search ? sql`p.name ILIKE ${`%${search}%`}` : sql`TRUE`}
    `;
    const total = Number(totalRows[0]?.count ?? 0);
    const rows = await sql<{
      id: string;
      name: string;
      slug: string;
      price: string;
      is_active: boolean;
      is_featured: boolean;
      stock_quantity: number;
      rating_average: string;
      created_at: Date;
      vendor_name: string;
      vendor_slug: string;
    }[]>`
      SELECT p.id, p.name, p.slug, p.price, p.is_active, p.is_featured,
             p.stock_quantity, p.rating_average, p.created_at,
             v.business_name AS vendor_name, v.slug AS vendor_slug
      FROM products p
      JOIN vendors v ON v.id = p.vendor_id
      WHERE ${search ? sql`p.name ILIKE ${`%${search}%`}` : sql`TRUE`}
      ORDER BY p.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          price: Number(row.price),
          isActive: row.is_active,
          isFeatured: row.is_featured,
          stockQuantity: row.stock_quantity,
          ratingAverage: Number(row.rating_average),
          createdAt: row.created_at,
          vendorName: row.vendor_name,
          vendorSlug: row.vendor_slug,
        })),
        pageMeta(total, page, pageSize),
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
