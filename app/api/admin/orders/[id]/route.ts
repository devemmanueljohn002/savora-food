import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser(request);
    const { id } = await ctx.params;
    const orders = await db()<{
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
      created_at: Date;
      vendor_name: string;
      vendor_slug: string;
      customer_email: string;
      customer_name: string | null;
      rider_name: string | null;
    }[]>`
      SELECT o.id, o.order_number, o.status, o.payment_status, o.currency,
             o.subtotal, o.delivery_fee,
             COALESCE(o.service_fee, 0) AS service_fee,
             COALESCE(o.tax_amount, 0) AS tax_amount,
             o.discount, o.total, o.created_at,
             v.business_name AS vendor_name, v.slug AS vendor_slug,
             u.email AS customer_email,
             TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
             dp.name AS rider_name
      FROM orders o
      JOIN vendors v ON v.id = o.vendor_id
      JOIN users u ON u.id = o.user_id
      LEFT JOIN delivery_partners dp ON dp.id = o.delivery_partner_id
      WHERE o.id = ${id}
      LIMIT 1
    `;
    const order = orders[0];
    if (!order) throw ApiError.notFound("Order not found.");
    const items = await db()<{
      name: string;
      quantity: number;
      line_total: string;
    }[]>`
      SELECT name, quantity, line_total FROM order_items WHERE order_id = ${id} ORDER BY created_at ASC
    `;
    const history = await db()<{
      status: string;
      note: string | null;
      created_at: Date;
    }[]>`
      SELECT status, note, created_at FROM order_status_history WHERE order_id = ${id} ORDER BY created_at ASC
    `;
    const settlements = await db()<{
      gross: string;
      commission_rate: string;
      commission_amount: string;
      rider_fee: string;
      vendor_net: string;
      status: string;
      created_at: Date;
    }[]>`
      SELECT gross::text, commission_rate::text, commission_amount::text,
             rider_fee::text, vendor_net::text, status, created_at
      FROM order_settlements WHERE order_id = ${id} LIMIT 1
    `;
    const settlement = settlements[0]
      ? {
          gross: Number(settlements[0].gross),
          commissionRate: Number(settlements[0].commission_rate),
          commissionAmount: Number(settlements[0].commission_amount),
          riderFee: Number(settlements[0].rider_fee),
          vendorNet: Number(settlements[0].vendor_net),
          status: settlements[0].status,
          createdAt: settlements[0].created_at,
        }
      : null;
    return NextResponse.json(
      ok({
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        paymentStatus: order.payment_status,
        currency: order.currency,
        subtotal: Number(order.subtotal),
        deliveryFee: Number(order.delivery_fee),
        serviceFee: Number(order.service_fee ?? 0),
        tax: Number(order.tax_amount ?? 0),
        discount: Number(order.discount),
        total: Number(order.total),
        createdAt: order.created_at,
        vendorName: order.vendor_name,
        vendorSlug: order.vendor_slug,
        customerEmail: order.customer_email,
        customerName: order.customer_name || null,
        riderName: order.rider_name,
        settlement,
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          lineTotal: Number(item.line_total),
        })),
        history: history.map((entry) => ({
          status: entry.status,
          note: entry.note,
          createdAt: entry.created_at,
        })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
