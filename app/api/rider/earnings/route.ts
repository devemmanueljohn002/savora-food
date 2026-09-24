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

    const sql = db();
    const totals = await sql<{
      delivered: string;
      earned: string;
      earned_7d: string;
      delivered_7d: string;
    }[]>`
      SELECT COUNT(*)::text AS delivered,
             COALESCE(SUM(o.delivery_fee), 0) AS earned,
             COALESCE(SUM(CASE WHEN d.delivered_at > NOW() - make_interval(days => 7) THEN o.delivery_fee ELSE 0 END), 0) AS earned_7d,
             COUNT(*) FILTER (WHERE d.delivered_at > NOW() - make_interval(days => 7))::text AS delivered_7d
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      WHERE d.delivery_partner_id = ${rider.id} AND d.status = 'DELIVERED'
    `;

    const byDay = await sql<{ day: string; earned: string; trips: string }[]>`
      SELECT to_char(d.delivered_at, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(o.delivery_fee), 0) AS earned,
             COUNT(*)::text AS trips
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      WHERE d.delivery_partner_id = ${rider.id}
        AND d.status = 'DELIVERED'
        AND d.delivered_at > NOW() - make_interval(days => 30)
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const recent = await sql<{
      id: string;
      order_number: string;
      delivery_fee: string;
      delivered_at: Date | null;
    }[]>`
      SELECT d.id, o.order_number, o.delivery_fee, d.delivered_at
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      WHERE d.delivery_partner_id = ${rider.id} AND d.status = 'DELIVERED'
      ORDER BY d.delivered_at DESC
      LIMIT 20
    `;

    return NextResponse.json(
      ok({
        delivered: Number(totals[0]?.delivered ?? 0),
        earned: Number(totals[0]?.earned ?? 0),
        last7Days: {
          earned: Number(totals[0]?.earned_7d ?? 0),
          delivered: Number(totals[0]?.delivered_7d ?? 0),
        },
        rating: { average: Number(rider.rating_average), count: rider.rating_count },
        byDay: byDay.map((row) => ({ day: row.day, earned: Number(row.earned), trips: Number(row.trips) })),
        recent: recent.map((row) => ({
          id: row.id,
          orderNumber: row.order_number,
          deliveryFee: Number(row.delivery_fee),
          deliveredAt: row.delivered_at,
        })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
