import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() || "";

    const rows = await db()<{
      id: string;
      status: string;
      full_name: string;
      phone: string;
      email: string;
      event_type: string;
      event_date: string;
      event_location: string;
      guest_count: number;
      special_requirements: string | null;
      created_at: Date;
      package_id: string;
      package_title: string;
      quote_id: string | null;
      quote_amount: string | null;
      quote_status: string | null;
    }[]>`
      SELECT cr.id, cr.status, cr.full_name, cr.phone, cr.email, cr.event_type,
             cr.event_date::text AS event_date, cr.event_location, cr.guest_count,
             cr.special_requirements, cr.created_at,
             cp.id AS package_id, cp.title AS package_title,
             q.id AS quote_id, q.quote_amount, q.status AS quote_status
      FROM catering_requests cr
      JOIN catering_packages cp ON cp.id = cr.package_id
      LEFT JOIN catering_quotes q ON q.request_id = cr.id
      WHERE cr.vendor_id = ${vendor.id} ${status ? db()`AND cr.status = ${status}` : db()``}
      ORDER BY cr.created_at DESC
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          status: row.status,
          fullName: row.full_name,
          phone: row.phone,
          email: row.email,
          eventType: row.event_type,
          eventDate: row.event_date,
          eventLocation: row.event_location,
          guestCount: row.guest_count,
          specialRequirements: row.special_requirements,
          createdAt: row.created_at,
          package: { id: row.package_id, title: row.package_title },
          quote: row.quote_id
            ? { id: row.quote_id, amount: Number(row.quote_amount), status: row.quote_status }
            : null,
        })),
        { count: rows.length },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
