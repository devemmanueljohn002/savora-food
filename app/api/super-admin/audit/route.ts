import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireSuperAdmin } from "@/server/auth/guard";
import { pageMeta, paging } from "@/server/admin";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const url = new URL(request.url);
    const action = url.searchParams.get("action")?.trim() || "";
    const { page, pageSize, offset } = paging(url);

    const sql = db();
    const totalRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM audit_logs
      WHERE ${action ? sql`action ILIKE ${`%${action}%`}` : sql`TRUE`}
    `;
    const total = Number(totalRows[0]?.count ?? 0);
    const rows = await sql<{
      id: string;
      user_id: string | null;
      user_email: string | null;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      meta: unknown;
      created_at: Date;
    }[]>`
      SELECT a.id, a.user_id, u.email AS user_email, a.action, a.entity_type, a.entity_id, a.meta, a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE ${action ? sql`a.action ILIKE ${`%${action}%`}` : sql`TRUE`}
      ORDER BY a.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          userEmail: row.user_email,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          meta: row.meta,
          createdAt: row.created_at,
        })),
        pageMeta(total, page, pageSize),
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
