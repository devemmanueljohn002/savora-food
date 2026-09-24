import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { db } from "@/server/db";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  shortDescription: z.string().trim().max(300).optional().nullable(),
  price: z.number().min(0).max(100000000).optional(),
  compareAtPrice: z.number().min(0).max(100000000).optional().nullable(),
  costPrice: z.number().min(0).max(100000000).optional().nullable(),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  ingredients: z.array(z.string().trim().max(200)).max(50).optional().nullable(),
  prepInfo: z.string().trim().max(1000).optional().nullable(),
  preparationMinutes: z.number().int().min(0).max(10080).optional().nullable(),
  availability: z.boolean().optional(),
  stockQuantity: z.number().int().min(0).max(1000000).optional(),
  isActive: z.boolean().optional(),
  productType: z.enum(["FOOD", "CAKE", "SNACK", "DRINK", "CATERING"]).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});

type VariantRow = {
  id: string;
  name: string;
  price: string | null;
  stock_quantity: number;
  is_active: boolean;
};

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id } = await ctx.params;
    const sql = db();
    const products = await sql<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      short_description: string | null;
      price: string;
      compare_at_price: string | null;
      cost_price: string | null;
      image_url: string | null;
      ingredients: unknown;
      prep_info: string | null;
      preparation_minutes: number | null;
      availability: boolean;
      stock_quantity: number;
      rating_average: string;
      rating_count: number;
      is_featured: boolean;
      is_active: boolean;
      product_type: string | null;
      category_id: string | null;
    }[]>`
      SELECT id, name, slug, description, short_description, price, compare_at_price,
             cost_price, image_url, ingredients, prep_info, preparation_minutes,
             availability, stock_quantity, rating_average, rating_count,
             is_featured, is_active, product_type, category_id
      FROM products WHERE id = ${id} AND vendor_id = ${vendor.id} LIMIT 1
    `;
    const product = products[0];
    if (!product) throw ApiError.notFound("Product not found.");
    const variants = await sql<VariantRow[]>`
      SELECT id, name, price, stock_quantity, is_active
      FROM product_variants WHERE product_id = ${id} ORDER BY created_at ASC
    `;
    return NextResponse.json(
      ok({
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        shortDescription: product.short_description,
        price: Number(product.price),
        compareAtPrice: product.compare_at_price === null ? null : Number(product.compare_at_price),
        costPrice: product.cost_price === null ? null : Number(product.cost_price),
        imageUrl: product.image_url,
        ingredients: Array.isArray(product.ingredients) ? (product.ingredients as string[]) : [],
        prepInfo: product.prep_info,
        preparationMinutes: product.preparation_minutes,
        availability: product.availability,
        stockQuantity: product.stock_quantity,
        ratingAverage: Number(product.rating_average),
        ratingCount: product.rating_count,
        isFeatured: product.is_featured,
        isActive: product.is_active,
        productType: product.product_type,
        categoryId: product.category_id,
        variants: variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: variant.price === null ? null : Number(variant.price),
          stockQuantity: variant.stock_quantity,
          isActive: variant.is_active,
        })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id } = await ctx.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const sql = db();
    const existing = await sql<{
      id: string;
      description: string | null;
      short_description: string | null;
      compare_at_price: string | null;
      cost_price: string | null;
      image_url: string | null;
      ingredients: unknown;
      prep_info: string | null;
      preparation_minutes: number | null;
      product_type: string | null;
      category_id: string | null;
    }[]>`
      SELECT id, description, short_description, compare_at_price, cost_price,
             image_url, ingredients, prep_info, preparation_minutes, product_type, category_id
      FROM products WHERE id = ${id} AND vendor_id = ${vendor.id} LIMIT 1
    `;
    const current = existing[0];
    if (!current) throw ApiError.notFound("Product not found.");
    if (parsed.data.categoryId) {
      const categories = await sql<{ id: string }[]>`
        SELECT id FROM categories WHERE id = ${parsed.data.categoryId} LIMIT 1
      `;
      if (!categories[0]) throw ApiError.validation("Choose a valid category.");
    }

    const d = parsed.data;
    const rows = await sql<{ id: string }[]>`
      UPDATE products SET
        name = COALESCE(${d.name ?? null}, name),
        description = ${d.description === undefined ? current.description : d.description},
        short_description = ${d.shortDescription === undefined ? current.short_description : d.shortDescription},
        price = COALESCE(${d.price ?? null}, price),
        compare_at_price = ${d.compareAtPrice === undefined ? current.compare_at_price : d.compareAtPrice},
        cost_price = ${d.costPrice === undefined ? current.cost_price : d.costPrice},
        image_url = ${d.imageUrl === undefined ? current.image_url : d.imageUrl},
        ingredients = ${(d.ingredients === undefined ? current.ingredients : (d.ingredients ?? [])) as unknown as string},
        prep_info = ${d.prepInfo === undefined ? current.prep_info : d.prepInfo},
        preparation_minutes = ${d.preparationMinutes === undefined ? current.preparation_minutes : d.preparationMinutes},
        availability = COALESCE(${d.availability ?? null}, availability),
        stock_quantity = COALESCE(${d.stockQuantity ?? null}, stock_quantity),
        is_active = COALESCE(${d.isActive ?? null}, is_active),
        product_type = ${d.productType === undefined ? current.product_type : d.productType},
        category_id = ${d.categoryId === undefined ? current.category_id : d.categoryId},
        updated_at = NOW()
      WHERE id = ${id} AND vendor_id = ${vendor.id}
      RETURNING id
    `;
    if (!rows[0]) throw ApiError.notFound("Product not found.");
    return NextResponse.json(ok({ updated: true, id }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id } = await ctx.params;
    const sql = db();
    // Soft-delete when the product has order history; hard-delete otherwise.
    const used = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM order_items WHERE product_id = ${id}
    `;
    if (Number(used[0]?.count ?? 0) > 0) {
      const rows = await sql<{ id: string }[]>`
        UPDATE products SET is_active = FALSE, availability = FALSE, updated_at = NOW()
        WHERE id = ${id} AND vendor_id = ${vendor.id}
        RETURNING id
      `;
      if (!rows[0]) throw ApiError.notFound("Product not found.");
      return NextResponse.json(ok({ deactivated: true, id }));
    }
    const rows = await sql<{ id: string }[]>`
      DELETE FROM products WHERE id = ${id} AND vendor_id = ${vendor.id} RETURNING id
    `;
    if (!rows[0]) throw ApiError.notFound("Product not found.");
    return NextResponse.json(ok({ removed: true, id }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
