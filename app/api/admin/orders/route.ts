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
      SELECT COUNT(*)::text AS count FROM orders o
      WHERE ${status ? sql`o.status = ${status}` : sql`TRUE`}
        ${search ? sql`AND o.order_number ILIKE ${`%${search}%`}` : sql``}
    `;
    const total = Number(totalRows[0]?.count ?? 0);
    const rows = await sql<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      total: string;
      created_at: Date;
      vendor_name: string;
      vendor_slug: string;
      customer_email: string;
    }[]>`
      SELECT o.id, o.order_number, o.status, o.payment_status, o.total, o.created_at,
             v.business_name AS vendor_name, v.slug AS vendor_slug, u.email AS customer_email
      FROM orders o
      JOIN vendors v ON v.id = o.vendor_id
      JOIN users u ON u.id = o.user_id
      WHERE ${status ? sql`o.status = ${status}` : sql`TRUE`}
        ${search ? sql`AND o.order_number ILIKE ${`%${search}%`}` : sql``}
      ORDER BY o.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          orderNumber: row.order_number,
          status: row.status,
          paymentStatus: row.payment_status,
          total: Number(row.total),
          createdAt: row.created_at,
          vendorName: row.vendor_name,
          vendorSlug: row.vendor_slug,
          customerEmail: row.customer_email,
        })),
        pageMeta(total, page, pageSize),
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
