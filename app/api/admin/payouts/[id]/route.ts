import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

const updateSchema = z.object({
  status: z.enum(["PENDING", "PROCESSING", "PAID", "FAILED"]).optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (!parsed.data.status) {
      throw ApiError.validation("Nothing to update.");
    }

    const sql = db();
    const rows = await sql<{ id: string; status: string }[]>`
      UPDATE vendor_payouts SET
        status = ${parsed.data.status},
        paid_at = CASE WHEN ${parsed.data.status} = 'PAID' THEN NOW() ELSE paid_at END
      WHERE id = ${id}
      RETURNING id, status
    `;
    if (!rows[0]) throw ApiError.notFound("Payout not found.");

    await auditLog({
      userId: admin.id,
      action: "payout.update",
      entityType: "payout",
      entityId: id,
      meta: { status: parsed.data.status },
    });

    return NextResponse.json(ok({ updated: true, id, status: rows[0].status }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
