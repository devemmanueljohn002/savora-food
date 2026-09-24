import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { db } from "@/server/db";

const createSchema = z.object({
  packageId: z.string().uuid("Invalid catering package.").optional(),
  packageSlug: z.string().trim().min(1).max(150).optional(),
  fullName: z.string().trim().min(1, "Full name is required").max(150),
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number"),
  email: z.email("Enter a valid email address"),
  eventType: z.string().trim().min(1, "Event type is required").max(100),
  eventDate: z.string().trim().min(1, "Event date is required"),
  eventLocation: z.string().trim().min(1, "Event location is required").max(500),
  guestCount: z.number().int().min(1, "Guest count must be at least 1").max(100000),
  specialRequirements: z.string().trim().max(2000).optional().nullable(),
}).refine((value) => value.packageId || value.packageSlug, {
  message: "Choose a catering package.",
});

type RequestRow = {
  id: string;
  status: string;
  full_name: string;
  event_type: string;
  event_date: string;
  event_location: string;
  guest_count: number;
  created_at: Date;
  package_id: string;
  package_title: string;
  package_slug: string;
  price_per_guest: string;
  vendor_id: string;
  vendor_name: string;
  vendor_slug: string;
  quote_id: string | null;
  quote_amount: string | null;
  quote_per_guest: string | null;
  quote_message: string | null;
  quote_status: string | null;
};

function toRequestDto(row: RequestRow) {
  return {
    id: row.id,
    status: row.status,
    fullName: row.full_name,
    eventType: row.event_type,
    eventDate: row.event_date,
    eventLocation: row.event_location,
    guestCount: row.guest_count,
    createdAt: row.created_at,
    package: {
      id: row.package_id,
      title: row.package_title,
      slug: row.package_slug,
      pricePerGuest: Number(row.price_per_guest),
    },
    vendor: { id: row.vendor_id, businessName: row.vendor_name, slug: row.vendor_slug },
    quote: row.quote_id
      ? {
          id: row.quote_id,
          amount: Number(row.quote_amount),
          perGuest: row.quote_per_guest === null ? null : Number(row.quote_per_guest),
          message: row.quote_message,
          status: row.quote_status,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const rows = await db()<RequestRow[]>`
      SELECT cr.id, cr.status, cr.full_name, cr.event_type,
             cr.event_date::text AS event_date, cr.event_location, cr.guest_count, cr.created_at,
             cp.id AS package_id, cp.title AS package_title, cp.slug AS package_slug,
             cp.price_per_guest, v.id AS vendor_id, v.business_name AS vendor_name, v.slug AS vendor_slug,
             q.id AS quote_id, q.quote_amount, q.per_guest AS quote_per_guest,
             q.message AS quote_message, q.status AS quote_status
      FROM catering_requests cr
      JOIN catering_packages cp ON cp.id = cr.package_id
      JOIN vendors v ON v.id = cr.vendor_id
      LEFT JOIN catering_quotes q ON q.request_id = cr.id
      WHERE cr.user_id = ${user.id}
      ORDER BY cr.created_at DESC
    `;
    return NextResponse.json(ok(rows.map(toRequestDto), { count: rows.length }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const eventDate = new Date(parsed.data.eventDate);
    if (Number.isNaN(eventDate.getTime())) {
      throw ApiError.validation("Enter a valid event date.");
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (eventDate < today) {
      throw ApiError.validation("Event date must be in the future.");
    }

    const sql = db();
    const packageId = parsed.data.packageId;
    const packageSlug = parsed.data.packageSlug;
    const packages = await sql<{
      id: string;
      vendor_id: string;
      minimum_guests: number;
    }[]>`
      SELECT cp.id, cp.vendor_id, cp.minimum_guests
      FROM catering_packages cp
      JOIN vendors v ON v.id = cp.vendor_id
      WHERE ${packageId ? sql`cp.id = ${packageId}` : sql`cp.slug = ${packageSlug ?? ""}`}
        AND cp.is_active = TRUE AND v.status = 'APPROVED'
      LIMIT 1
    `;
    const pack = packages[0];
    if (!pack) {
      throw ApiError.notFound("This catering package is no longer available.");
    }
    if (parsed.data.guestCount < pack.minimum_guests) {
      throw ApiError.validation(`This package requires at least ${pack.minimum_guests} guests.`);
    }

    const rows = await sql<RequestRow[]>`
      INSERT INTO catering_requests (
        package_id, user_id, vendor_id, full_name, phone, email, event_type,
        event_date, event_location, guest_count, special_requirements, status
      )
      VALUES (
        ${pack.id}, ${user.id}, ${pack.vendor_id}, ${parsed.data.fullName}, ${parsed.data.phone},
        ${parsed.data.email.toLowerCase()}, ${parsed.data.eventType}, ${parsed.data.eventDate},
        ${parsed.data.eventLocation}, ${parsed.data.guestCount},
        ${parsed.data.specialRequirements ?? null}, 'SUBMITTED'
      )
      RETURNING id, status, full_name, event_type, event_date::text AS event_date,
                event_location, guest_count, created_at,
                package_id, vendor_id,
                (SELECT title FROM catering_packages WHERE id = ${pack.id}) AS package_title,
                (SELECT slug FROM catering_packages WHERE id = ${pack.id}) AS package_slug,
                (SELECT price_per_guest FROM catering_packages WHERE id = ${pack.id}) AS price_per_guest,
                (SELECT business_name FROM vendors WHERE id = ${pack.vendor_id}) AS vendor_name,
                (SELECT slug FROM vendors WHERE id = ${pack.vendor_id}) AS vendor_slug,
                NULL::uuid AS quote_id, NULL::numeric AS quote_amount, NULL::numeric AS quote_per_guest,
                NULL::text AS quote_message, NULL::text AS quote_status
    `;

    // Notify the vendor about the new request.
    const vendorOwners = await sql<{ user_id: string }[]>`
      SELECT user_id FROM vendors WHERE id = ${pack.vendor_id} LIMIT 1
    `;
    if (vendorOwners[0]) {
      await sql`
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
          ${vendorOwners[0].user_id}, 'CATERING',
          'New catering request',
          ${`${parsed.data.fullName} requested catering for ${parsed.data.guestCount} guests on ${parsed.data.eventDate}.`},
          ${JSON.stringify({ requestId: rows[0].id })}::jsonb
        )
      `;
    }

    return NextResponse.json(ok(toRequestDto(rows[0]), { submitted: true }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
