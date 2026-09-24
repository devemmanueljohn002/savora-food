import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { db } from "@/server/db";

const EARNING_STATUSES = ["PAID", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED"];

export async function GET(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const sql = db();
    const rate = Number(vendor.commission_rate ?? 10);

    const totals = await sql<{
      gross_30d: string;
      orders_30d: string;
      gross_all: string;
      orders_all: string;
      pending_balance: string;
    }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN o.created_at > NOW() - make_interval(days => 30) THEN o.total ELSE 0 END), 0) AS gross_30d,
        COUNT(*) FILTER (WHERE o.created_at > NOW() - make_interval(days => 30))::text AS orders_30d,
        COALESCE(SUM(o.total), 0) AS gross_all,
        COUNT(*)::text AS orders_all,
        COALESCE(SUM(CASE WHEN o.status IN ('PAID','CONFIRMED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED') THEN o.total ELSE 0 END), 0) AS pending_balance
      FROM orders o
      WHERE o.vendor_id = ${vendor.id}
        AND o.status = ANY(${EARNING_STATUSES}::text[])
    `;

    const paidOut = await sql<{ paid_total: string }[]>`
      SELECT COALESCE(SUM(net_amount), 0) AS paid_total FROM vendor_payouts
      WHERE vendor_id = ${vendor.id} AND status = 'PAID'
    `;

    const payouts = await sql<{
      id: string;
      reference: string;
      period_start: string | null;
      period_end: string | null;
      gross_amount: string;
      commission_amount: string;
      net_amount: string;
      status: string;
      paid_at: Date | null;
      created_at: Date;
    }[]>`
      SELECT id, reference, period_start::text, period_end::text, gross_amount,
             commission_amount, net_amount, status, paid_at, created_at
      FROM vendor_payouts
      WHERE vendor_id = ${vendor.id}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const grossAll = Number(totals[0]?.gross_all ?? 0);
    const paidTotal = Number(paidOut[0]?.paid_total ?? 0);
    const gross30d = Number(totals[0]?.gross_30d ?? 0);
    const commission30d = Math.round(gross30d * rate) / 100;

    return NextResponse.json(
      ok({
        commissionRate: rate,
        last30Days: {
          gross: gross30d,
          commission: commission30d,
          net: gross30d - commission30d,
          orders: Number(totals[0]?.orders_30d ?? 0),
        },
        lifetime: {
          gross: grossAll,
          commission: Math.round(grossAll * rate) / 100,
          net: grossAll - Math.round(grossAll * rate) / 100,
          orders: Number(totals[0]?.orders_all ?? 0),
        },
        availableBalance: Math.max(0, grossAll - Math.round(grossAll * rate) / 100 - paidTotal),
        paidOut: paidTotal,
        payouts: payouts.map((payout) => ({
          id: payout.id,
          reference: payout.reference,
          periodStart: payout.period_start,
          periodEnd: payout.period_end,
          gross: Number(payout.gross_amount),
          commission: Number(payout.commission_amount),
          net: Number(payout.net_amount),
          status: payout.status,
          paidAt: payout.paid_at,
          createdAt: payout.created_at,
        })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
