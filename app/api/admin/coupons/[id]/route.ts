import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";
import { couponDto, type CouponRow } from "@/server/coupons";

const couponSchema = z.object({
  code: z.string().trim().min(2).max(50),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.number().min(0).max(100000000),
  maxUses: z.number().int().min(1).max(1000000).optional().nullable(),
  startsAt: z.string().trim().max(40).optional().nullable(),
  expiresAt: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean().optional(),
  vendorId: z.string().uuid().optional().nullable(),
});

const updateSchema = couponSchema.partial().omit({ code: true });

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

    const sql = db();
    const existing = await sql<{ id: string }[]>`SELECT id FROM coupons WHERE id = ${id} LIMIT 1`;
    if (!existing[0]) throw ApiError.notFound("Coupon not found.");
    const d = parsed.data;
    if (d.type === "PERCENT" && d.value !== undefined && d.value > 100) {
      throw ApiError.validation("Percentage discounts cannot exceed 100.");
    }
    const rows = await sql<{ id: string }[]>`
      UPDATE coupons SET
        type = COALESCE(${d.type ?? null}, type),
        value = COALESCE(${d.value ?? null}, value),
        max_uses = ${d.maxUses === undefined ? sql`max_uses` : d.maxUses},
        starts_at = ${d.startsAt === undefined ? sql`starts_at` : d.startsAt ? new Date(d.startsAt) : null},
        expires_at = ${d.expiresAt === undefined ? sql`expires_at` : d.expiresAt ? new Date(d.expiresAt) : null},
        is_active = COALESCE(${d.isActive ?? null}, is_active),
        vendor_id = ${d.vendorId === undefined ? sql`vendor_id` : d.vendorId}
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows[0]) throw ApiError.notFound("Coupon not found.");

    await auditLog({
      userId: admin.id,
      action: "coupon.update",
      entityType: "coupon",
      entityId: id,
      meta: { ...parsed.data },
    });

    return NextResponse.json(ok({ updated: true, id }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const rows = await db()<{
      id: string;
    }[]>`DELETE FROM coupons WHERE id = ${id} RETURNING id`;
    if (!rows[0]) throw ApiError.notFound("Coupon not found.");

    await auditLog({ userId: admin.id, action: "coupon.delete", entityType: "coupon", entityId: id });

    return NextResponse.json(ok({ removed: true, id }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
