import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderByUserId } from "@/server/riders";
import { db } from "@/server/db";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number").optional().nullable(),
  vehicleType: z.string().trim().max(100).optional().nullable(),
  vehicleNumber: z.string().trim().max(50).optional().nullable(),
  status: z.enum(["ACTIVE", "OFFLINE"]).optional(),
  currentZone: z.string().trim().max(120).optional().nullable(),
});

async function requireRider(request: NextRequest) {
  return requireRole(request, [ROLES.DELIVERY_PARTNER, ROLES.ADMIN]);
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireRider(request);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");
    const documents = await db()<{
      id: string;
      kind: string;
      url: string;
      status: string;
      created_at: Date;
    }[]>`
      SELECT id, kind, url, status, created_at FROM rider_documents
      WHERE delivery_partner_id = ${rider.id} ORDER BY created_at DESC
    `;
    return NextResponse.json(
      ok({
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        vehicleType: rider.vehicle_type,
        vehicleNumber: rider.vehicle_number,
        status: rider.status,
        isOnline: rider.is_online ?? rider.status === "ACTIVE",
        currentZone: rider.current_zone ?? null,
        verificationStatus: rider.verification_status,
        verifiedAt: rider.verified_at,
        ratingAverage: Number(rider.rating_average),
        ratingCount: rider.rating_count,
        documentNote: rider.document_note,
        documents: documents.map((doc) => ({
          id: doc.id,
          kind: doc.kind,
          url: doc.url,
          status: doc.status,
          createdAt: doc.created_at,
        })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireRider(request);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const d = parsed.data;
    const sql = db();
    const goingOnline = d.status === "ACTIVE";
    // NOTE: never interpolate a possibly-null/undefined value into a
    // typeless SQL position (e.g. `CASE WHEN ${x} IS NULL` or
    // `COALESCE(${x}, col)` with x undefined) — Postgres cannot infer the
    // parameter type (42P18) and the whole PATCH 500s. Emit a column
    // reference instead when the field was not supplied.
    const rows = await sql<{
      id: string;
      name: string;
      phone: string | null;
      vehicle_type: string | null;
      vehicle_number: string | null;
      status: string;
      is_online: boolean;
      current_zone: string | null;
    }[]>`
      UPDATE delivery_partners SET
        name = ${d.name === undefined ? sql`name` : d.name},
        phone = ${d.phone === undefined ? sql`phone` : d.phone},
        vehicle_type = ${d.vehicleType === undefined ? sql`vehicle_type` : d.vehicleType},
        vehicle_number = ${d.vehicleNumber === undefined ? sql`vehicle_number` : d.vehicleNumber},
        status = ${d.status === undefined ? sql`status` : d.status},
        is_online = ${d.status === undefined ? sql`is_online` : d.status === "ACTIVE"},
        last_active_at = ${goingOnline ? sql`NOW()` : sql`last_active_at`}
        ${d.currentZone === undefined ? sql`` : sql`, current_zone = ${d.currentZone}`}
      WHERE id = ${rider.id}
      RETURNING id, name, phone, vehicle_type, vehicle_number, status, is_online, current_zone
    `;
    const next = rows[0];
    return NextResponse.json(
      ok({
        id: next.id,
        name: next.name,
        phone: next.phone,
        vehicleType: next.vehicle_type,
        vehicleNumber: next.vehicle_number,
        status: next.status,
        isOnline: next.is_online,
        currentZone: next.current_zone,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
