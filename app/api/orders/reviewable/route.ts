import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { db } from "@/server/db";

const querySchema = z.object({
  productId: z.string().uuid("Invalid product."),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ productId: url.searchParams.get("productId") });
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const rows = await db()<{
      order_id: string;
      order_number: string;
      delivered_at: string | null;
      reviewed: boolean;
    }[]>`
      SELECT o.id AS order_id, o.order_number,
             (SELECT h.created_at::text FROM order_status_history h
              WHERE h.order_id = o.id AND h.status = 'DELIVERED'
              ORDER BY h.created_at DESC LIMIT 1) AS delivered_at,
             EXISTS (
               SELECT 1 FROM reviews r
               WHERE r.user_id = ${user.id} AND r.order_id = o.id AND r.product_id = ${parsed.data.productId}
             ) AS reviewed
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = ${user.id}
        AND o.status = 'DELIVERED'
        AND oi.product_id = ${parsed.data.productId}
      ORDER BY o.created_at DESC
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          orderId: row.order_id,
          orderNumber: row.order_number,
          deliveredAt: row.delivered_at,
          reviewed: row.reviewed,
        })),
        { count: rows.length },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
