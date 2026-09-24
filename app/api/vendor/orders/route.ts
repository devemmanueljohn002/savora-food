import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { db } from "@/server/db";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  currency: string;
  subtotal: string;
  delivery_fee: string;
  service_fee: string;
  tax_amount: string;
  discount: string;
  total: string;
  delivery_instructions: string | null;
  preferred_delivery_time: Date | null;
  created_at: Date;
  customer_name: string | null;
  customer_phone: string | null;
  item_count: number;
};

const STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "RIDER_ASSIGNED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

export async function GET(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() || "";
    const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);

    if (status && !(STATUSES as readonly string[]).includes(status)) {
      throw ApiError.validation("Invalid order status filter.");
    }

    const sql = db();
    const totalRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM orders
      WHERE vendor_id = ${vendor.id} ${status ? sql`AND status = ${status}` : sql``}
    `;
    const total = Number(totalRows[0]?.count ?? 0);
    const rows = await sql<OrderRow[]>`
      SELECT o.id, o.order_number, o.status, o.payment_status, o.currency,
             o.subtotal, o.delivery_fee,
             COALESCE(o.service_fee, 0) AS service_fee,
             COALESCE(o.tax_amount, 0) AS tax_amount,
             o.discount, o.total,
             o.delivery_instructions, o.preferred_delivery_time, o.created_at,
             TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
             COALESCE(u.phone, a.phone) AS customer_phone,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
      FROM orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      WHERE o.vendor_id = ${vendor.id} ${status ? sql`AND o.status = ${status}` : sql``}
      ORDER BY o.created_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          orderNumber: row.order_number,
          status: row.status,
          paymentStatus: row.payment_status,
          currency: row.currency,
          subtotal: Number(row.subtotal),
          deliveryFee: Number(row.delivery_fee),
          serviceFee: Number(row.service_fee ?? 0),
          tax: Number(row.tax_amount ?? 0),
          discount: Number(row.discount),
          total: Number(row.total),
          deliveryInstructions: row.delivery_instructions,
          preferredDeliveryTime: row.preferred_delivery_time,
          createdAt: row.created_at,
          customerName: row.customer_name || null,
          customerPhone: row.customer_phone,
          itemCount: row.item_count,
        })),
        { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
