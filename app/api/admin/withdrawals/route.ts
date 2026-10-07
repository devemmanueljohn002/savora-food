import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";
import { koboToNaira, type WithdrawalRow } from "@/server/wallet";

type PagedWithdrawal = {
  id: string;
  owner_type: string;
  owner_id: string;
  owner_name: string;
  amount_kobo: string;
  reference: string;
  paystack_transfer_code: string | null;
  status: string;
  failure_reason: string | null;
  account_number: string | null;
  account_name: string | null;
  created_at: Date;
};

/**
 * Finance view of payout withdrawals from BOTH rails. The owner name is
 * resolved per owner_type with a LATERAL join (vendor business_name vs rider
 * name) so no separate admin query is needed per owner type.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() || "";
    const ownerType = url.searchParams.get("owner_type")?.trim().toUpperCase() || "";
    const sql = db();
    const rows = await sql<PagedWithdrawal[]>`
      SELECT w.id, w.owner_type, w.owner_id,
             o.owner_name,
             w.amount_kobo::text AS amount_kobo,
             w.reference, w.paystack_transfer_code, w.status, w.failure_reason,
             w.account_number, w.account_name, w.created_at
      FROM withdrawals w
      CROSS JOIN LATERAL (
        SELECT
          CASE w.owner_type
            WHEN 'VENDOR' THEN COALESCE(v.business_name, 'Vendor')
            WHEN 'RIDER' THEN COALESCE(r.name, 'Rider')
            WHEN 'AFFILIATE' THEN COALESCE(a.full_name, 'Affiliate')
            ELSE w.owner_type
          END AS owner_name
        FROM (SELECT 1) AS x
        LEFT JOIN vendors v ON w.owner_type = 'VENDOR' AND v.id = w.owner_id
        LEFT JOIN delivery_partners r ON w.owner_type = 'RIDER' AND r.id = w.owner_id
        LEFT JOIN affiliates a ON w.owner_type = 'AFFILIATE' AND a.id = w.owner_id
      ) AS o
      WHERE (${status === ""} OR w.status = ${status})
        AND (${ownerType === ""} OR w.owner_type = ${ownerType})
      ORDER BY w.created_at DESC
      LIMIT 50
    `;
    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          ownerType: row.owner_type,
          ownerId: row.owner_id,
          ownerName: row.owner_name,
          amountKobo: Number(row.amount_kobo),
          amount: koboToNaira(Number(row.amount_kobo)),
          reference: row.reference,
          transferCode: row.paystack_transfer_code,
          status: row.status,
          failureReason: row.failure_reason,
          accountNumber: row.account_number,
          accountName: row.account_name,
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

export type { WithdrawalRow };