import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext, slugify, uniqueSlug } from "@/server/vendors";
import { db } from "@/server/db";

type ProductRow = {
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
  availability: boolean;
  stock_quantity: number;
  rating_average: string;
  rating_count: number;
  is_featured: boolean;
  is_active: boolean;
  product_type: string | null;
  category_id: string | null;
  category_name: string | null;
  created_at: Date;
  variant_count: number;
  orders_30d: number;
  revenue_30d: string;
};

const createSchema = z.object({
  name: z.string().trim().min(2, "Product name is required").max(150),
  description: z.string().trim().max(5000).optional().nullable(),
  shortDescription: z.string().trim().max(300).optional().nullable(),
  price: z.number().min(0, "Price cannot be negative.").max(100000000),
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

function toProductDto(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    shortDescription: row.short_description,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    costPrice: row.cost_price === null ? null : Number(row.cost_price),
    imageUrl: row.image_url,
    ingredients: Array.isArray(row.ingredients) ? (row.ingredients as string[]) : [],
    prepInfo: row.prep_info,
    availability: row.availability,
    stockQuantity: row.stock_quantity,
    ratingAverage: Number(row.rating_average),
    ratingCount: row.rating_count,
    isFeatured: row.is_featured,
    isActive: row.is_active,
    productType: row.product_type,
    categoryId: row.category_id,
    categoryName: row.category_name,
    createdAt: row.created_at,
    variantCount: row.variant_count,
    orders30d: row.orders_30d,
    revenue30d: Number(row.revenue_30d),
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() || "";
    const active = url.searchParams.get("active"); // "true" | "false" | null
    const lowStock = url.searchParams.get("lowStock") === "true";

    const sql = db();
    const rows = await sql<ProductRow[]>`
      SELECT p.id, p.name, p.slug, p.description, p.short_description, p.price,
             p.compare_at_price, p.cost_price, p.image_url, p.ingredients, p.prep_info,
             p.availability, p.stock_quantity, p.rating_average, p.rating_count,
             p.is_featured, p.is_active, p.product_type, p.category_id, c.name AS category_name,
             p.created_at,
             (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
             (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_id = p.id AND o.status NOT IN ('CANCELLED', 'REFUNDED', 'PENDING_PAYMENT')
                AND o.created_at > NOW() - make_interval(days => 30)) AS orders_30d,
             COALESCE((SELECT SUM(oi.line_total) FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_id = p.id AND o.status NOT IN ('CANCELLED', 'REFUNDED', 'PENDING_PAYMENT')
                AND o.created_at > NOW() - make_interval(days => 30)), 0) AS revenue_30d
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.vendor_id = ${vendor.id}
        ${search ? sql`AND p.name ILIKE ${`%${search}%`}` : sql``}
        ${active === "true" ? sql`AND p.is_active = TRUE` : active === "false" ? sql`AND p.is_active = FALSE` : sql``}
        ${lowStock ? sql`AND p.stock_quantity <= 5` : sql``}
      ORDER BY p.created_at DESC
    `;

    return NextResponse.json(ok(rows.map(toProductDto), { count: rows.length }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.categoryId) {
      const categories = await db()<{
        id: string;
      }[]>`SELECT id FROM categories WHERE id = ${parsed.data.categoryId} LIMIT 1`;
      if (!categories[0]) throw ApiError.validation("Choose a valid category.");
    }

    const slug = await uniqueSlug("products", slugify(parsed.data.name, "product"));
    const sql = db();
    const rows = await sql<ProductRow[]>`
      INSERT INTO products (
        vendor_id, category_id, name, slug, description, short_description, price,
        compare_at_price, cost_price, image_url, ingredients, prep_info, preparation_minutes,
        availability, stock_quantity, is_active, product_type
      )
      VALUES (
        ${vendor.id}, ${parsed.data.categoryId ?? null}, ${parsed.data.name}, ${slug},
        ${parsed.data.description ?? null}, ${parsed.data.shortDescription ?? null}, ${parsed.data.price},
        ${parsed.data.compareAtPrice ?? null}, ${parsed.data.costPrice ?? null},
        ${parsed.data.imageUrl ?? null}, ${JSON.stringify(parsed.data.ingredients ?? [])}::jsonb,
        ${parsed.data.prepInfo ?? null}, ${parsed.data.preparationMinutes ?? null},
        ${parsed.data.availability ?? true}, ${parsed.data.stockQuantity ?? 0},
        ${parsed.data.isActive ?? true}, ${parsed.data.productType ?? null}
      )
      RETURNING id, name, slug, description, short_description, price, compare_at_price,
                cost_price, image_url, ingredients, prep_info, availability, stock_quantity,
                rating_average, rating_count, is_featured, is_active, product_type,
                category_id, NULL::text AS category_name, created_at,
                0 AS variant_count, 0 AS orders_30d, 0::numeric AS revenue_30d
    `;

    return NextResponse.json(ok(toProductDto(rows[0]), { created: true }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
