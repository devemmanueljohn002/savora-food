import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderByUserId } from "@/server/riders";
import { db } from "@/server/db";

const locationSchema = z.object({
  deliveryId: z.string().uuid().optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  accuracyM: z.number().int().min(0).max(100000).optional().nullable(),
  zone: z.string().trim().max(120).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER, ROLES.ADMIN]);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");
    const parsed = locationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    const sql = db();
    if (parsed.data.deliveryId) {
      const own = await sql<{ id: string }[]>`
        SELECT id FROM deliveries WHERE id = ${parsed.data.deliveryId} AND delivery_partner_id = ${rider.id} LIMIT 1
      `;
      if (!own[0]) throw ApiError.notFound("Delivery not found.");
    }
    await sql`
      INSERT INTO rider_locations (delivery_partner_id, delivery_id, lat, lng, accuracy_m)
      VALUES (${rider.id}, ${parsed.data.deliveryId ?? null}, ${parsed.data.lat ?? null}, ${parsed.data.lng ?? null}, ${parsed.data.accuracyM ?? null})
    `;
    await sql`
      UPDATE delivery_partners
      SET last_active_at = NOW(), is_online = TRUE
        ${parsed.data.zone ? sql`, current_zone = ${parsed.data.zone}` : sql``}
      WHERE id = ${rider.id}
    `;
    return NextResponse.json(ok({ recorded: true }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
