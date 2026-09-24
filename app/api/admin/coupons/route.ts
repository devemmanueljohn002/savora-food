import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";
import { couponDto, type CouponRow } from "./[id]/route";

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

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const rows = await db()<CouponRow[]>`
      SELECT c.id, c.code, c.type, c.value, c.max_uses, c.used_count,
             c.starts_at, c.expires_at, c.is_active, c.vendor_id,
             v.business_name AS vendor_name, c.created_at
      FROM coupons c
      LEFT JOIN vendors v ON v.id = c.vendor_id
      ORDER BY c.created_at DESC
      LIMIT 100
    `;
    return NextResponse.json(ok(rows.map(couponDto), { count: rows.length }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request);
    const parsed = couponSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (parsed.data.type === "PERCENT" && parsed.data.value > 100) {
      throw ApiError.validation("Percentage discounts cannot exceed 100.");
    }
    if (parsed.data.vendorId) {
      const vendors = await db()<{
        id: string;
      }[]>`SELECT id FROM vendors WHERE id = ${parsed.data.vendorId} LIMIT 1`;
      if (!vendors[0]) throw ApiError.validation("Choose a valid vendor or leave it platform-wide.");
    }

    const sql = db();
    const code = parsed.data.code.toUpperCase();
    const rows = await sql<CouponRow[]>`
      INSERT INTO coupons (code, type, value, max_uses, starts_at, expires_at, is_active, vendor_id)
      VALUES (
        ${code}, ${parsed.data.type}, ${parsed.data.value}, ${parsed.data.maxUses ?? null},
        ${parsed.data.startsAt ? new Date(parsed.data.startsAt) : null},
        ${parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null},
        ${parsed.data.isActive ?? true}, ${parsed.data.vendorId ?? null}
      )
      RETURNING id, code, type, value, max_uses, used_count, starts_at, expires_at,
                is_active, vendor_id, NULL::text AS vendor_name, created_at
    `;
    const created = rows[0];

    await auditLog({
      userId: admin.id,
      action: "coupon.create",
      entityType: "coupon",
      entityId: created.id,
      meta: { code },
    });

    return NextResponse.json(ok(couponDto(created)), { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
    ) {
      const { envelope, status } = toEnvelope(ApiError.conflict("A coupon with this code already exists."));
      return NextResponse.json(envelope, { status });
    }
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
