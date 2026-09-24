import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { db } from "@/server/db";

const variantSchema = z.object({
  name: z.string().trim().min(1, "Variant name is required").max(150),
  price: z.number().min(0).max(100000000).optional().nullable(),
  stockQuantity: z.number().int().min(0).max(1000000).optional(),
  isActive: z.boolean().optional(),
});

async function vendorProduct(productId: string, vendorId: string) {
  const rows = await db()<{
    id: string;
  }[]>`SELECT id FROM products WHERE id = ${productId} AND vendor_id = ${vendorId} LIMIT 1`;
  return rows[0];
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id } = await ctx.params;
    if (!(await vendorProduct(id, vendor.id))) throw ApiError.notFound("Product not found.");
    const variants = await db()<{
      id: string;
      name: string;
      price: string | null;
      stock_quantity: number;
      is_active: boolean;
    }[]>`
      SELECT id, name, price, stock_quantity, is_active
      FROM product_variants WHERE product_id = ${id} ORDER BY created_at ASC
    `;
    return NextResponse.json(
      ok(
        variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: variant.price === null ? null : Number(variant.price),
          stockQuantity: variant.stock_quantity,
          isActive: variant.is_active,
        })),
        { count: variants.length },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id } = await ctx.params;
    if (!(await vendorProduct(id, vendor.id))) throw ApiError.notFound("Product not found.");
    const parsed = variantSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const rows = await db()<{
      id: string;
      name: string;
      price: string | null;
      stock_quantity: number;
      is_active: boolean;
    }[]>`
      INSERT INTO product_variants (product_id, name, price, stock_quantity, is_active)
      VALUES (${id}, ${parsed.data.name}, ${parsed.data.price ?? null},
              ${parsed.data.stockQuantity ?? 0}, ${parsed.data.isActive ?? true})
      ON CONFLICT (product_id, name) DO UPDATE
        SET price = EXCLUDED.price, stock_quantity = EXCLUDED.stock_quantity,
            is_active = EXCLUDED.is_active, updated_at = NOW()
      RETURNING id, name, price, stock_quantity, is_active
    `;
    const variant = rows[0];
    return NextResponse.json(
      ok({
        id: variant.id,
        name: variant.name,
        price: variant.price === null ? null : Number(variant.price),
        stockQuantity: variant.stock_quantity,
        isActive: variant.is_active,
      }),
      { status: 201 },
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
