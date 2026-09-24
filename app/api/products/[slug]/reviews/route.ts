import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { getProductBySlug, listProductReviews } from "@/server/queries/catalog";
import { db } from "@/server/db";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const product = await getProductBySlug(slug);
    if (!product) {
      throw ApiError.notFound("This product is no longer available.");
    }

    const reviews = await listProductReviews(product.id, 50);
    return NextResponse.json(ok(reviews, { count: reviews.length }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

const reviewSchema = z.object({
  orderId: z.string().uuid("Choose the order this review is for."),
  rating: z.number().int().min(1, "Rating must be between 1 and 5.").max(5, "Rating must be between 1 and 5."),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { slug } = await ctx.params;
    const product = await getProductBySlug(slug);
    if (!product) {
      throw ApiError.notFound("This product is no longer available.");
    }

    const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    // The order must belong to the customer, contain this product, and be delivered.
    const orders = await sql<{ id: string; vendor_id: string }[]>`
      SELECT o.id, o.vendor_id
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ${parsed.data.orderId}
        AND o.user_id = ${user.id}
        AND o.status = 'DELIVERED'
        AND oi.product_id = ${product.id}
      LIMIT 1
    `;
    const order = orders[0];
    if (!order) {
      throw ApiError.forbidden("You can only review products from a delivered order.");
    }

    const rows = await sql<{ id: string }[]>`
      INSERT INTO reviews (user_id, order_id, product_id, vendor_id, rating, comment, is_approved)
      VALUES (${user.id}, ${order.id}, ${product.id}, ${order.vendor_id}, ${parsed.data.rating}, ${parsed.data.comment ?? null}, TRUE)
      ON CONFLICT (user_id, order_id, product_id, vendor_id) DO UPDATE
        SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = NOW()
      RETURNING id
    `;

    const reviews = await listProductReviews(product.id, 50);
    return NextResponse.json(ok(reviews, { count: reviews.length, reviewId: rows[0]?.id }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}