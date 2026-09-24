import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

const updateSchema = categorySchema.partial();

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const d = parsed.data;
    const sql = db();
    const existing = await sql<{
      description: string | null;
    }[]>`SELECT description FROM categories WHERE id = ${id} LIMIT 1`;
    if (!existing[0]) throw ApiError.notFound("Category not found.");
    const rows = await sql<{
      id: string;
    }[]>`
      UPDATE categories SET
        name = COALESCE(${d.name ?? null}, name),
        description = ${d.description === undefined ? existing[0].description : d.description},
        is_active = COALESCE(${d.isActive ?? null}, is_active),
        sort_order = COALESCE(${d.sortOrder ?? null}, sort_order)
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows[0]) throw ApiError.notFound("Category not found.");

    await auditLog({
      userId: admin.id,
      action: "category.update",
      entityType: "category",
      entityId: id,
      meta: { ...parsed.data },
    });

    return NextResponse.json(ok({ updated: true, id }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
