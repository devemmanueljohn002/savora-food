import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSuperAdmin } from "@/server/auth/guard";
import { auditLog } from "@/server/admin";
import { db } from "@/server/db";

const updateSchema = z.object({
  role: z.enum(["ADMIN", "SUPER_ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSuperAdmin(request);
    const { id } = await ctx.params;
    if (id === admin.id) {
      throw ApiError.forbidden("You cannot change your own admin account.");
    }
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (parsed.data.role === undefined && parsed.data.status === undefined) {
      throw ApiError.validation("Nothing to update.");
    }

    const sql = db();
    const rows = await sql<{ id: string; role: string; status: string }[]>`
      UPDATE users SET
        role = COALESCE(${parsed.data.role ?? null}, role),
        status = COALESCE(${parsed.data.status ?? null}, status),
        updated_at = NOW()
      WHERE id = ${id} AND role IN ('ADMIN', 'SUPER_ADMIN')
      RETURNING id, role, status
    `;
    if (!rows[0]) throw ApiError.notFound("Admin not found.");
    if (parsed.data.status === "SUSPENDED") {
      await sql`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${id} AND revoked_at IS NULL`;
    }

    await auditLog({
      userId: admin.id,
      action: "admin.update",
      entityType: "user",
      entityId: id,
      meta: { ...parsed.data },
    });

    return NextResponse.json(ok({ updated: true, id, role: rows[0].role, status: rows[0].status }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
