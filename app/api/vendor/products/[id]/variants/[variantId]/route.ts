import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { db } from "@/server/db";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  price: z.number().min(0).max(100000000).optional().nullable(),
  stockQuantity: z.number().int().min(0).max(1000000).optional(),
  isActive: z.boolean().optional(),
});

async function vendorVariant(productId: string, variantId: string, vendorId: string) {
  const rows = await db()<{
    id: string;
  }[]>`
    SELECT v.id FROM product_variants v
    JOIN products p ON p.id = v.product_id
    WHERE v.id = ${variantId} AND v.product_id = ${productId} AND p.vendor_id = ${vendorId}
    LIMIT 1
  `;
  return rows[0];
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; variantId: string }> },
) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id, variantId } = await ctx.params;
    if (!(await vendorVariant(id, variantId, vendor.id))) throw ApiError.notFound("Variant not found.");
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const d = parsed.data;
    const current = await db()<{
      price: string | null;
    }[]>`SELECT price FROM product_variants WHERE id = ${variantId} LIMIT 1`;
    const rows = await db()<{
      id: string;
      name: string;
      price: string | null;
      stock_quantity: number;
      is_active: boolean;
    }[]>`
      UPDATE product_variants SET
        name = COALESCE(${d.name ?? null}, name),
        price = ${d.price === undefined ? current[0]?.price ?? null : d.price},
        stock_quantity = COALESCE(${d.stockQuantity ?? null}, stock_quantity),
        is_active = COALESCE(${d.isActive ?? null}, is_active),
        updated_at = NOW()
      WHERE id = ${variantId}
      RETURNING id, name, price, stock_quantity, is_active
    `;
    const variant = rows[0];
    if (!variant) throw ApiError.notFound("Variant not found.");
    return NextResponse.json(
      ok({
        id: variant.id,
        name: variant.name,
        price: variant.price === null ? null : Number(variant.price),
        stockQuantity: variant.stock_quantity,
        isActive: variant.is_active,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; variantId: string }> },
) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id, variantId } = await ctx.params;
    if (!(await vendorVariant(id, variantId, vendor.id))) throw ApiError.notFound("Variant not found.");
    await db()`DELETE FROM product_variants WHERE id = ${variantId}`;
    return NextResponse.json(ok({ removed: true }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
