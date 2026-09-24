import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext, notifyUser } from "@/server/vendors";
import { db } from "@/server/db";

const quoteSchema = z.object({
  action: z.enum(["quote", "decline"]),
  amount: z.number().min(0).max(1000000000).optional(),
  perGuest: z.number().min(0).max(1000000000).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id } = await ctx.params;
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
      price_per_guest: string;
      quote_id: string | null;
      quote_amount: string | null;
      quote_per_guest: string | null;
      quote_message: string | null;
      quote_status: string | null;
      quote_responded_at: Date | null;
    }[]>`
      SELECT cr.id, cr.status, cr.full_name, cr.phone, cr.email, cr.event_type,
             cr.event_date::text AS event_date, cr.event_location, cr.guest_count,
             cr.special_requirements, cr.created_at,
             cp.id AS package_id, cp.title AS package_title, cp.price_per_guest,
             q.id AS quote_id, q.quote_amount, q.per_guest AS quote_per_guest,
             q.message AS quote_message, q.status AS quote_status, q.responded_at AS quote_responded_at
      FROM catering_requests cr
      JOIN catering_packages cp ON cp.id = cr.package_id
      LEFT JOIN catering_quotes q ON q.request_id = cr.id
      WHERE cr.id = ${id} AND cr.vendor_id = ${vendor.id}
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
          pricePerGuest: Number(row.price_per_guest),
        },
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
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const { id } = await ctx.params;
    const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const rows = await sql<{ id: string; status: string; user_id: string; guest_count: number }[]>`
      SELECT id, status, user_id, guest_count FROM catering_requests
      WHERE id = ${id} AND vendor_id = ${vendor.id} LIMIT 1
    `;
    const booking = rows[0];
    if (!booking) throw ApiError.notFound("Catering request not found.");
    if (["BOOKED", "ACCEPTED", "CANCELLED", "DECLINED"].includes(booking.status)) {
      throw ApiError.conflict("This request is already closed.");
    }

    if (parsed.data.action === "decline") {
      await sql`
        UPDATE catering_requests SET status = 'DECLINED', updated_at = NOW() WHERE id = ${id}
      `;
      await notifyUser({
        userId: booking.user_id,
        type: "CATERING",
        title: "Catering request declined",
        body: `${vendor.business_name} is unable to take your event. Try another caterer on Savora Food.`,
        data: { requestId: id, status: "DECLINED" },
      });
      return NextResponse.json(ok({ status: "DECLINED" }));
    }

    if (parsed.data.amount === undefined) {
      throw ApiError.validation("Quote amount is required.");
    }
    const perGuest = parsed.data.perGuest ?? parsed.data.amount / Math.max(1, booking.guest_count);
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO catering_quotes (request_id, quote_amount, per_guest, message, status, responded_at)
        VALUES (${id}, ${parsed.data.amount ?? 0}, ${perGuest},
                ${parsed.data.message ?? null}, 'PENDING', NOW())
        ON CONFLICT (request_id) DO UPDATE
          SET quote_amount = EXCLUDED.quote_amount, per_guest = EXCLUDED.per_guest,
              message = EXCLUDED.message, status = 'PENDING', responded_at = NOW()
      `;
      await tx`UPDATE catering_requests SET status = 'QUOTED', updated_at = NOW() WHERE id = ${id}`;
    });
    await notifyUser({
      userId: booking.user_id,
      type: "CATERING",
      title: "Your catering quote is ready",
      body: `${vendor.business_name} quoted ₦${Number(parsed.data.amount).toLocaleString("en-NG")} for ${booking.guest_count} guests. Review it in your dashboard.`,
      data: { requestId: id, status: "QUOTED" },
    });
    return NextResponse.json(ok({ status: "QUOTED" }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
