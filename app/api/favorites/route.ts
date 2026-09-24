import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { db } from "@/server/db";

const toggleSchema = z
  .object({
    productId: z.string().uuid("Invalid product.").optional(),
    vendorId: z.string().uuid("Invalid vendor.").optional(),
  })
  .refine((value) => value.productId || value.vendorId, {
    message: "Provide a productId or vendorId.",
  });

type FavoriteProductRow = {
  id: string;
  created_at: Date;
  product_id: string;
  name: string;
  slug: string;
  price: string;
  compare_at_price: string | null;
  image_url: string | null;
  rating_average: string;
  vendor_name: string | null;
  vendor_slug: string | null;
};

type FavoriteVendorRow = {
  id: string;
  created_at: Date;
  vendor_id: string;
  business_name: string;
  slug: string;
  logo_url: string | null;
  city: string | null;
  rating_average: string;
};

export async function GET(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const sql = db();

    const products = await sql<FavoriteProductRow[]>`
      SELECT f.id, f.created_at, p.id AS product_id, p.name, p.slug,
             p.price, p.compare_at_price, p.image_url, p.rating_average,
             v.business_name AS vendor_name, v.slug AS vendor_slug
      FROM favorites f
      JOIN products p ON p.id = f.product_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE f.user_id = ${user.id} AND f.product_id IS NOT NULL
      ORDER BY f.created_at DESC
    `;
    const vendors = await sql<FavoriteVendorRow[]>`
      SELECT f.id, f.created_at, v.id AS vendor_id, v.business_name, v.slug,
             v.logo_url, v.city, v.rating_average
      FROM favorites f
      JOIN vendors v ON v.id = f.vendor_id
      WHERE f.user_id = ${user.id} AND f.vendor_id IS NOT NULL
      ORDER BY f.created_at DESC
    `;

    return NextResponse.json(
      ok(
        {
          products: products.map((row) => ({
            id: row.id,
            createdAt: row.created_at,
            product: {
              id: row.product_id,
              name: row.name,
              slug: row.slug,
              price: Number(row.price),
              compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
              imageUrl: row.image_url,
              ratingAverage: Number(row.rating_average),
              vendorName: row.vendor_name,
              vendorSlug: row.vendor_slug,
            },
          })),
          vendors: vendors.map((row) => ({
            id: row.id,
            createdAt: row.created_at,
            vendor: {
              id: row.vendor_id,
              businessName: row.business_name,
              slug: row.slug,
              logoUrl: row.logo_url,
              city: row.city,
              ratingAverage: Number(row.rating_average),
            },
          })),
        },
        { productCount: products.length, vendorCount: vendors.length },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const parsed = toggleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const productId = parsed.data.productId;
    const vendorId = parsed.data.vendorId;
    if (productId) {
      const product = await sql<{ id: string }[]>`
        SELECT id FROM products WHERE id = ${productId} AND is_active = TRUE LIMIT 1
      `;
      if (!product[0]) throw ApiError.notFound("This product is no longer available.");
      const existing = await sql<{ id: string }[]>`
        SELECT id FROM favorites WHERE user_id = ${user.id} AND product_id = ${productId} LIMIT 1
      `;
      if (existing[0]) {
        await sql`DELETE FROM favorites WHERE id = ${existing[0].id}`;
        return NextResponse.json(ok({ favorited: false, productId }));
      }
      await sql`
        INSERT INTO favorites (user_id, product_id) VALUES (${user.id}, ${productId})
        ON CONFLICT DO NOTHING
      `;
      return NextResponse.json(ok({ favorited: true, productId }), { status: 201 });
    }

    if (!vendorId) throw ApiError.validation("Provide a productId or vendorId.");
    const vendor = await sql<{ id: string }[]>`
      SELECT id FROM vendors WHERE id = ${vendorId} AND status = 'APPROVED' LIMIT 1
    `;
    if (!vendor[0]) throw ApiError.notFound("This vendor is no longer available.");
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM favorites WHERE user_id = ${user.id} AND vendor_id = ${vendorId} LIMIT 1
    `;
    if (existing[0]) {
      await sql`DELETE FROM favorites WHERE id = ${existing[0].id}`;
      return NextResponse.json(ok({ favorited: false, vendorId }));
    }
    await sql`
      INSERT INTO favorites (user_id, vendor_id) VALUES (${user.id}, ${vendorId})
      ON CONFLICT DO NOTHING
    `;
    return NextResponse.json(ok({ favorited: true, vendorId }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const parsed = toggleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const productId = parsed.data.productId;
    const vendorId = parsed.data.vendorId;
    if (productId) {
      await sql`DELETE FROM favorites WHERE user_id = ${user.id} AND product_id = ${productId}`;
    } else if (vendorId) {
      await sql`DELETE FROM favorites WHERE user_id = ${user.id} AND vendor_id = ${vendorId}`;
    }
    return NextResponse.json(ok({ removed: true }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
