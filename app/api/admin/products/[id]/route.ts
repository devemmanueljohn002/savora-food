import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

const updateSchema = z.object({
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (parsed.data.isFeatured === undefined && parsed.data.isActive === undefined) {
      throw ApiError.validation("Nothing to update.");
    }

    const sql = db();
    const rows = await sql<{ id: string }[]>`
      UPDATE products SET
        is_featured = COALESCE(${parsed.data.isFeatured ?? null}, is_featured),
        is_active = COALESCE(${parsed.data.isActive ?? null}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows[0]) throw ApiError.notFound("Product not found.");

    await auditLog({
      userId: admin.id,
      action: "product.update",
      entityType: "product",
      entityId: id,
      meta: { ...parsed.data },
    });

    return NextResponse.json(ok({ updated: true, id }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
