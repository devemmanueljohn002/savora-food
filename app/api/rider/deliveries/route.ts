import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderByUserId } from "@/server/riders";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER, ROLES.ADMIN]);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");

    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() || "";
    const active = url.searchParams.get("active") === "true";

    const rows = await db()<{
      id: string;
      status: string;
      assigned_at: Date | null;
      picked_up_at: Date | null;
      delivered_at: Date | null;
      order_id: string;
      order_number: string;
      order_status: string;
      total: string;
      delivery_fee: string;
      require_otp: boolean | null;
      item_count: number;
      created_at: Date;
      vendor_name: string;
      vendor_slug: string;
      address: string | null;
      city: string | null;
      state: string | null;
      customer_name: string | null;
      customer_phone: string | null;
    }[]>`
      SELECT d.id, d.status, d.assigned_at, d.picked_up_at, d.delivered_at,
             o.id AS order_id, o.order_number, o.status AS order_status, o.total, o.delivery_fee,
             COALESCE(o.require_otp, FALSE) AS require_otp,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
             o.created_at, v.business_name AS vendor_name, v.slug AS vendor_slug,
             a.full_address AS address, a.city, a.state,
             TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
             COALESCE(u.phone, a.phone) AS customer_phone
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      JOIN vendors v ON v.id = o.vendor_id
      JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      WHERE d.delivery_partner_id = ${rider.id}
        ${status ? db()`AND d.status = ${status}` : db()``}
        ${active ? db()`AND d.status IN ('ASSIGNED','GOING_TO_VENDOR','ARRIVED_AT_VENDOR','PICKED_UP','IN_TRANSIT')` : db()``}
      ORDER BY d.created_at DESC
      LIMIT 50
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          status: row.status,
          assignedAt: row.assigned_at,
          pickedUpAt: row.picked_up_at,
          deliveredAt: row.delivered_at,
          requireOtp: Boolean(row.require_otp),
          order: {
            id: row.order_id,
            orderNumber: row.order_number,
            status: row.order_status,
            total: Number(row.total),
            deliveryFee: Number(row.delivery_fee),
            itemCount: row.item_count,
            createdAt: row.created_at,
          },
          vendor: { name: row.vendor_name, slug: row.vendor_slug },
          customer: { name: row.customer_name || null, phone: row.customer_phone },
          address:
            row.address == null
              ? null
              : { fullAddress: row.address, city: row.city, state: row.state },
        })),
        { count: rows.length },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
