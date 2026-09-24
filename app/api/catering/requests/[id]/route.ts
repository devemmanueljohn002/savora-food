import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { db } from "@/server/db";

type DetailRow = {
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
  package_slug: string;
  price_per_guest: string;
  minimum_guests: number;
  vendor_id: string;
  vendor_name: string;
  vendor_slug: string;
  quote_id: string | null;
  quote_amount: string | null;
  quote_per_guest: string | null;
  quote_message: string | null;
  quote_status: string | null;
  quote_responded_at: Date | null;
};

const actionSchema = z.object({
  action: z.enum(["accept", "cancel"]),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { id } = await ctx.params;
    const rows = await db()<DetailRow[]>`
      SELECT cr.id, cr.status, cr.full_name, cr.phone, cr.email, cr.event_type,
             cr.event_date::text AS event_date, cr.event_location, cr.guest_count,
             cr.special_requirements, cr.created_at,
             cp.id AS package_id, cp.title AS package_title, cp.slug AS package_slug,
             cp.price_per_guest, cp.minimum_guests,
             v.id AS vendor_id, v.business_name AS vendor_name, v.slug AS vendor_slug,
             q.id AS quote_id, q.quote_amount, q.per_guest AS quote_per_guest,
             q.message AS quote_message, q.status AS quote_status, q.responded_at AS quote_responded_at
      FROM catering_requests cr
      JOIN catering_packages cp ON cp.id = cr.package_id
      JOIN vendors v ON v.id = cr.vendor_id
      LEFT JOIN catering_quotes q ON q.request_id = cr.id
      WHERE cr.id = ${id} AND cr.user_id = ${user.id}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw ApiError.notFound("Catering request not found.");

    return NextResponse.json(
      ok({
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
        package: {
          id: row.package_id,
          title: row.package_title,
          slug: row.package_slug,
          pricePerGuest: Number(row.price_per_guest),
          minimumGuests: row.minimum_guests,
        },
        vendor: { id: row.vendor_id, businessName: row.vendor_name, slug: row.vendor_slug },
        quote: row.quote_id
          ? {
              id: row.quote_id,
              amount: Number(row.quote_amount),
              perGuest: row.quote_per_guest === null ? null : Number(row.quote_per_guest),
              message: row.quote_message,
              status: row.quote_status,
              respondedAt: row.quote_responded_at,
            }
          : null,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { id } = await ctx.params;
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const rows = await sql<{ id: string; status: string; vendor_id: string }[]>`
      SELECT id, status, vendor_id FROM catering_requests
      WHERE id = ${id} AND user_id = ${user.id}
      LIMIT 1
    `;
    const booking = rows[0];
    if (!booking) throw ApiError.notFound("Catering request not found.");

    if (parsed.data.action === "accept") {
      if (!["QUOTED", "ACCEPTED"].includes(booking.status)) {
        throw ApiError.conflict("There is no quote to accept on this request yet.");
      }
      await sql.begin(async (tx) => {
        await tx`
          UPDATE catering_quotes SET status = 'ACCEPTED', responded_at = NOW()
          WHERE request_id = ${id}
        `;
        await tx`
          UPDATE catering_requests SET status = 'BOOKED', updated_at = NOW()
          WHERE id = ${id}
        `;
      });
      const vendorOwners = await sql<{ user_id: string }[]>`
        SELECT user_id FROM vendors WHERE id = ${booking.vendor_id} LIMIT 1
      `;
      if (vendorOwners[0]) {
        await sql`
          INSERT INTO notifications (user_id, type, title, body, data)
          VALUES (
            ${vendorOwners[0].user_id}, 'CATERING', 'Catering quote accepted',
            'A customer accepted your catering quote. The event is now booked.',
            ${JSON.stringify({ requestId: id })}::jsonb
          )
        `;
      }
      return NextResponse.json(ok({ status: "BOOKED" }));
    }

    if (["BOOKED", "CANCELLED"].includes(booking.status)) {
      throw ApiError.conflict("This booking can no longer be cancelled here. Please contact the vendor.");
    }
    await sql`UPDATE catering_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = ${id}`;
    return NextResponse.json(ok({ status: "CANCELLED" }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
