import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { pageMeta, paging, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const url = new URL(request.url);
    const verification = url.searchParams.get("verification")?.trim() || "";
    const search = url.searchParams.get("search")?.trim() || "";
    const { page, pageSize, offset } = paging(url);

    const sql = db();
    const totalRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM delivery_partners dp
      WHERE ${verification ? sql`dp.verification_status = ${verification}` : sql`TRUE`}
        ${search ? sql`AND (dp.name ILIKE ${`%${search}%`} OR dp.phone ILIKE ${`%${search}%`})` : sql``}
    `;
    const total = Number(totalRows[0]?.count ?? 0);
    const rows = await sql<{
      id: string;
      name: string;
      phone: string | null;
      vehicle_type: string | null;
      status: string;
      verification_status: string;
      rating_average: string;
      rating_count: number;
      created_at: Date;
      delivery_count: number;
      pending_documents: number;
    }[]>`
      SELECT dp.id, dp.name, dp.phone, dp.vehicle_type, dp.status, dp.verification_status,
             dp.rating_average, dp.rating_count, dp.created_at,
             (SELECT COUNT(*) FROM deliveries d WHERE d.delivery_partner_id = dp.id AND d.status = 'DELIVERED') AS delivery_count,
             (SELECT COUNT(*) FROM rider_documents rd WHERE rd.delivery_partner_id = dp.id AND rd.status = 'PENDING') AS pending_documents
      FROM delivery_partners dp
      WHERE ${verification ? sql`dp.verification_status = ${verification}` : sql`TRUE`}
        ${search ? sql`AND (dp.name ILIKE ${`%${search}%`} OR dp.phone ILIKE ${`%${search}%`})` : sql``}
      ORDER BY dp.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          phone: row.phone,
          vehicleType: row.vehicle_type,
          status: row.status,
          verificationStatus: row.verification_status,
          ratingAverage: Number(row.rating_average),
          ratingCount: row.rating_count,
          createdAt: row.created_at,
          deliveryCount: row.delivery_count,
          pendingDocuments: row.pending_documents,
        })),
        pageMeta(total, page, pageSize),
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
