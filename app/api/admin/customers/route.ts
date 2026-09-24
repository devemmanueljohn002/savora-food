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
      SELECT COUNT(*)::text AS count FROM users u
      WHERE u.role = 'CUSTOMER'
        ${search ? sql`AND (u.email ILIKE ${`%${search}%`} OR u.first_name ILIKE ${`%${search}%`} OR u.last_name ILIKE ${`%${search}%`})` : sql``}
    `;
    const total = Number(totalRows[0]?.count ?? 0);
    const rows = await sql<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      status: string;
      email_verified_at: Date | null;
      created_at: Date;
      order_count: number;
      total_spent: string;
    }[]>`
      SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status,
             u.email_verified_at, u.created_at,
             (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
             (SELECT COALESCE(SUM(o.total), 0) FROM orders o
              WHERE o.user_id = u.id AND o.status NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT')) AS total_spent
      FROM users u
      WHERE u.role = 'CUSTOMER'
        ${search ? sql`AND (u.email ILIKE ${`%${search}%`} OR u.first_name ILIKE ${`%${search}%`} OR u.last_name ILIKE ${`%${search}%`})` : sql``}
      ORDER BY u.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          phone: row.phone,
          status: row.status,
          emailVerified: row.email_verified_at !== null,
          createdAt: row.created_at,
          orderCount: row.order_count,
          totalSpent: Number(row.total_spent),
        })),
        pageMeta(total, page, pageSize),
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
