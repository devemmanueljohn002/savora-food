import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { notifyUser } from "@/server/vendors";
import { db } from "@/server/db";

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "OFFLINE", "SUSPENDED"]).optional(),
  verificationStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  documentNote: z.string().trim().max(500).optional().nullable(),
  reviewDocuments: z.enum(["APPROVED", "REJECTED"]).optional(),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser(request);
    const { id } = await ctx.params;
    const rows = await db()<{
      id: string;
      name: string;
      phone: string | null;
      vehicle_type: string | null;
      vehicle_number: string | null;
      status: string;
      verification_status: string;
      verified_at: Date | null;
      rating_average: string;
      rating_count: number;
      document_note: string | null;
      created_at: Date;
      user_email: string;
    }[]>`
      SELECT dp.id, dp.name, dp.phone, dp.vehicle_type, dp.vehicle_number, dp.status,
             dp.verification_status, dp.verified_at, dp.rating_average, dp.rating_count,
             dp.document_note, dp.created_at, u.email AS user_email
      FROM delivery_partners dp JOIN users u ON u.id = dp.user_id
      WHERE dp.id = ${id} LIMIT 1
    `;
    const rider = rows[0];
    if (!rider) throw ApiError.notFound("Rider not found.");
    const documents = await db()<{
      id: string;
      kind: string;
      url: string;
      status: string;
      created_at: Date;
    }[]>`
      SELECT id, kind, url, status, created_at FROM rider_documents
      WHERE delivery_partner_id = ${id} ORDER BY created_at DESC
    `;
    const stats = await db()<{
      delivered: string;
      earned: string;
    }[]>`
      SELECT COUNT(*) FILTER (WHERE d.status = 'DELIVERED')::text AS delivered,
             COALESCE(SUM(o.delivery_fee) FILTER (WHERE d.status = 'DELIVERED'), 0) AS earned
      FROM deliveries d JOIN orders o ON o.id = d.order_id
      WHERE d.delivery_partner_id = ${id}
    `;
    return NextResponse.json(
      ok({
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        vehicleType: rider.vehicle_type,
        vehicleNumber: rider.vehicle_number,
        status: rider.status,
        verificationStatus: rider.verification_status,
        verifiedAt: rider.verified_at,
        ratingAverage: Number(rider.rating_average),
        ratingCount: rider.rating_count,
        documentNote: rider.document_note,
        createdAt: rider.created_at,
        userEmail: rider.user_email,
        delivered: Number(stats[0]?.delivered ?? 0),
        earned: Number(stats[0]?.earned ?? 0),
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

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const sql = db();
    const existing = await sql<{ id: string; user_id: string; verification_status: string; name: string }[]>`
      SELECT id, user_id, verification_status, name FROM delivery_partners WHERE id = ${id} LIMIT 1
    `;
    const rider = existing[0];
    if (!rider) throw ApiError.notFound("Rider not found.");

    const d = parsed.data;
    const rows = await sql<{ id: string; verification_status: string; status: string }[]>`
      UPDATE delivery_partners SET
        status = COALESCE(${d.status ?? null}, status),
        verification_status = COALESCE(${d.verificationStatus ?? null}, verification_status),
        verified_at = CASE WHEN ${d.verificationStatus ?? null} = 'APPROVED' THEN NOW() ELSE verified_at END,
        document_note = ${d.documentNote === undefined ? sql`document_note` : d.documentNote}
      WHERE id = ${id}
      RETURNING id, verification_status, status
    `;

    if (d.reviewDocuments) {
      await sql`
        UPDATE rider_documents SET status = ${d.reviewDocuments}, reviewed_at = NOW()
        WHERE delivery_partner_id = ${id} AND status = 'PENDING'
      `;
    }

    if (d.verificationStatus && d.verificationStatus !== rider.verification_status) {
      await notifyUser({
        userId: rider.user_id,
        type: "RIDER",
        title: `Rider application ${d.verificationStatus.toLowerCase()}`,
        body:
          d.verificationStatus === "APPROVED"
            ? `Welcome aboard, ${rider.name}! Go online to start accepting delivery jobs.`
            : "Your rider application was not approved. Contact support for details.",
        data: { riderId: id, status: d.verificationStatus },
      });
    }

    await auditLog({
      userId: admin.id,
      action: "rider.update",
      entityType: "rider",
      entityId: id,
      meta: { from: rider.verification_status, ...parsed.data },
    });

    return NextResponse.json(
      ok({ updated: true, id, verificationStatus: rows[0]?.verification_status, status: rows[0]?.status }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
