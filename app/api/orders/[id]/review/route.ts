import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  getOrderReview,
  insertOrderReview,
  sanitizeReviewComment,
} from "@/server/reviews";

const reviewSchema = z.object({
  vendorRating: z
    .number()
    .int()
    .min(1, "Rating must be between 1 and 5.")
    .max(5, "Rating must be between 1 and 5."),
  vendorComment: z.string().trim().max(500, "Comment must be 500 characters or fewer.").optional().nullable(),
  riderRating: z
    .number()
    .int()
    .min(1, "Rider rating must be between 1 and 5.")
    .max(5, "Rider rating must be between 1 and 5.")
    .optional()
    .nullable(),
  riderComment: z.string().trim().max(500, "Rider comment must be 500 characters or fewer.").optional().nullable(),
});

type OrderRow = {
  id: string;
  user_id: string;
  vendor_id: string;
  status: string;
  delivery_partner_id: string | null;
  rider_id: string | null;
};

async function loadOrder(orderId: string): Promise<OrderRow | null> {
  const rows = await db()<OrderRow[]>`
    SELECT o.id, o.user_id, o.vendor_id, o.status,
           o.delivery_partner_id,
           COALESCE(o.delivery_partner_id, d.delivery_partner_id) AS rider_id
    FROM orders o
    LEFT JOIN deliveries d ON d.order_id = o.id
    WHERE o.id = ${orderId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { id } = await ctx.params;
    const order = await loadOrder(id);
    if (!order) throw ApiError.notFound("Order not found.");
    if (order.user_id !== user.id) {
      throw ApiError.forbidden("You can only review your own orders.");
    }
    return NextResponse.json(ok(await getOrderReview(order.id)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { id } = await ctx.params;
    const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const order = await loadOrder(id);
    if (!order) throw ApiError.notFound("Order not found.");
    if (order.user_id !== user.id) {
      throw ApiError.forbidden("You can only review your own orders.");
    }
    if (order.status !== "DELIVERED") {
      throw ApiError.conflict("You can review this order after it has been delivered.");
    }

    const vendorComment = sanitizeReviewComment(parsed.data.vendorComment);
    const riderComment = sanitizeReviewComment(parsed.data.riderComment);
    const riderRating = parsed.data.riderRating ?? null;
    const riderId = order.rider_id;

    if ((riderRating != null || riderComment != null) && !riderId) {
      throw ApiError.validation("This order was not delivered by a rider, so rider feedback is unavailable.");
    }

    if (await getOrderReview(order.id)) {
      throw ApiError.conflict("You have already reviewed this order.");
    }

    const review = await insertOrderReview({
      orderId: order.id,
      customerId: user.id,
      vendorId: order.vendor_id,
      riderId,
      vendorRating: parsed.data.vendorRating,
      vendorComment,
      riderRating,
      riderComment,
    });
    if (!review) {
      throw ApiError.conflict("You have already reviewed this order.");
    }

    return NextResponse.json(ok(review), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
