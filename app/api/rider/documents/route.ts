import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderByUserId } from "@/server/riders";
import { db } from "@/server/db";

const documentSchema = z.object({
  kind: z.enum(["DRIVERS_LICENSE", "PROOF_OF_IDENTITY", "PROFILE_PHOTO", "VEHICLE_DOCUMENT", "OTHER"]),
  url: z.string().trim().min(1, "Upload a document first.").max(500),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER, ROLES.ADMIN]);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");
    const parsed = documentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const rows = await db()<{
      id: string;
      kind: string;
      url: string;
      status: string;
      created_at: Date;
    }[]>`
      INSERT INTO rider_documents (delivery_partner_id, kind, url, status)
      VALUES (${rider.id}, ${parsed.data.kind}, ${parsed.data.url}, 'PENDING')
      RETURNING id, kind, url, status, created_at
    `;
    const doc = rows[0];
    return NextResponse.json(
      ok({
        id: doc.id,
        kind: doc.kind,
        url: doc.url,
        status: doc.status,
        createdAt: doc.created_at,
      }),
      { status: 201 },
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
