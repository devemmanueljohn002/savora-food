import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

const createSchema = z.object({
  vendorId: z.string().uuid("Invalid vendor."),
  periodStart: z.string().trim().max(20).optional().nullable(),
  periodEnd: z.string().trim().max(20).optional().nullable(),
  feesAmount: z.number().min(0).max(1000000000).optional(),
});

function reference(): string {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PAYOUT-SV-${stamp}-${rand}`;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() || "";
    const rows = await db()<{
      id: string;
      vendor_id: string;
      vendor_name: string;
      reference: string;
      period_start: string | null;
      period_end: string | null;
      gross_amount: string;
      commission_amount: string;
      fees_amount: string;
      net_amount: string;
      status: string;
      paid_at: Date | null;
      created_at: Date;
    }[]>`
      SELECT p.id, p.vendor_id, v.business_name AS vendor_name, p.reference,
             p.period_start::text, p.period_end::text, p.gross_amount, p.commission_amount,
             p.fees_amount, p.net_amount, p.status, p.paid_at, p.created_at
      FROM vendor_payouts p
      JOIN vendors v ON v.id = p.vendor_id
      WHERE ${status ? db()`p.status = ${status}` : db()`TRUE`}
      ORDER BY p.created_at DESC
      LIMIT 50
    `;
    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          vendorId: row.vendor_id,
          vendorName: row.vendor_name,
          reference: row.reference,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          gross: Number(row.gross_amount),
          commission: Number(row.commission_amount),
          fees: Number(row.fees_amount),
          net: Number(row.net_amount),
          status: row.status,
          paidAt: row.paid_at,
          createdAt: row.created_at,
        })),
        { count: rows.length },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const vendors = await sql<{ id: string; commission_rate: string }[]>`
      SELECT id, commission_rate FROM vendors WHERE id = ${parsed.data.vendorId} LIMIT 1
    `;
    const vendor = vendors[0];
    if (!vendor) throw ApiError.notFound("Vendor not found.");

    // Settle all earning orders not yet covered by a non-failed payout.
    const settled = await sql<{ gross: string }[]>`
      SELECT COALESCE(SUM(o.total), 0) AS gross FROM orders o
      WHERE o.vendor_id = ${vendor.id}
        AND o.status IN ('PAID','CONFIRMED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED')
    `;
    const paid = await sql<{ paid: string }[]>`
      SELECT COALESCE(SUM(net_amount), 0) AS paid FROM vendor_payouts
      WHERE vendor_id = ${vendor.id} AND status IN ('PENDING','PROCESSING','PAID')
    `;
    const rate = Number(vendor.commission_rate);
    const gross = Number(settled[0]?.gross ?? 0);
    const commission = Math.round(gross * rate) / 100;
    const fees = parsed.data.feesAmount ?? 0;
    const net = Math.max(0, gross - commission - fees - Number(paid[0]?.paid ?? 0));
    if (net <= 0) {
      throw ApiError.conflict("This vendor has no unsettled balance.");
    }

    const rows = await sql<{ id: string; reference: string }[]>`
      INSERT INTO vendor_payouts (
        vendor_id, reference, period_start, period_end,
        gross_amount, commission_amount, fees_amount, net_amount, status
      )
      VALUES (
        ${vendor.id}, ${reference()},
        ${parsed.data.periodStart || null}::date, ${parsed.data.periodEnd || null}::date,
        ${gross}, ${commission}, ${fees}, ${net}, 'PENDING'
      )
      RETURNING id, reference
    `;

    await auditLog({
      userId: admin.id,
      action: "payout.create",
      entityType: "payout",
      entityId: rows[0]?.id,
      meta: { vendorId: vendor.id, net },
    });

    return NextResponse.json(ok({ id: rows[0]?.id, reference: rows[0]?.reference, net }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
