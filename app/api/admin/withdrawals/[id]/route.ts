import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";
import {
  applyAdjustment,
  claimWithdrawalForApproval,
  failWithdrawalAndReverse,
  nairaToKobo,
  type Owner,
  type WithdrawalRow,
} from "@/server/wallet";
import { initiateTransferAndRecord } from "@/server/payouts";

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "bonus", "penalty"]),
  note: z.string().trim().max(500).optional().nullable(),
  amountNaira: z.number().positive().max(10_000_000).optional(),
  reason: z.string().trim().max(300).optional().nullable(),
  // Only for bonus/penalty: which wallet to adjust.
  ownerType: z.enum(["VENDOR", "RIDER", "AFFILIATE"]).optional(),
  ownerId: z.string().trim().uuid().optional(),
});

/**
 * Finance review for BOTH rails:
 *  - approve: executes the Paystack transfer for a PENDING large withdrawal
 *    (vendor OR rider) and stamps the approving admin.
 *  - reject: restores the locked funds to that owner's available balance.
 *  - bonus / penalty: writes an available-balance ledger entry for a rider or
 *    vendor. The SIGN comes from the action, never the client, so a penalty
 *    can never be turned into a payout by tampering.
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();

    if (parsed.data.action === "bonus" || parsed.data.action === "penalty") {
      const { amountNaira, ownerType, ownerId } = parsed.data;
      if (!amountNaira) throw ApiError.validation("Enter the amount for this adjustment.");
      if (!ownerType || !ownerId) throw ApiError.validation("Select the wallet owner to adjust.");

      const kind = parsed.data.action === "bonus" ? "bonus" : "penalty";
      // Magnitude only: the sign is fixed by the action, so a penalty can never
      // be flipped into a payout by tampering with the request.
      const magnitude = nairaToKobo(amountNaira);
      const owner: Owner = { type: ownerType, id: ownerId };
      await applyAdjustment({
        owner,
        kind,
        amountKobo: kind === "bonus" ? magnitude : -magnitude,
        reason: parsed.data.reason ?? parsed.data.note ?? null,
        adminId: admin.id,
      });
      await auditLog({
        userId: admin.id,
        action: `withdrawal.${kind}`,
        entityType: "wallet",
        entityId: ownerId,
        meta: { ownerType, amountKobo: kind === "bonus" ? magnitude : -magnitude },
      });
      return NextResponse.json(ok({ status: kind.toUpperCase(), ownerType, ownerId }));
    }

    const rows = await sql<WithdrawalRow[]>`SELECT * FROM withdrawals WHERE id = ${id} LIMIT 1`;
    const withdrawal = rows[0];
    if (!withdrawal) throw ApiError.notFound("Withdrawal not found.");
    if (withdrawal.status !== "PENDING") {
      throw ApiError.conflict(`Only pending withdrawals can be reviewed (current: ${withdrawal.status}).`);
    }

    if (parsed.data.action === "reject") {
      await failWithdrawalAndReverse(id, parsed.data.note ?? "Rejected by finance.");
      await auditLog({
        userId: admin.id,
        action: "withdrawal.reject",
        entityType: "withdrawal",
        entityId: id,
        meta: {
          ownerType: withdrawal.owner_type,
          ownerId: withdrawal.owner_id,
          amountKobo: Number(withdrawal.amount_kobo),
        },
      });
      return NextResponse.json(ok({ status: "FAILED", reversed: true }));
    }

    // Approve: funds were already locked at request time, so executing now is
    // safe. Sends the NET amount (after the stored fee snapshot) with the
    // per-owner Paystack reason. Ambiguous Paystack failures park as PROCESSING.
    // Atomic claim first: a concurrent approver loses here and never reaches
    // the Paystack call, so one row can never produce two transfers.
    const claimed = await claimWithdrawalForApproval(id, admin.id);
    if (!claimed) {
      throw ApiError.conflict("This withdrawal was already reviewed by someone else.");
    }
    const netKobo =
      withdrawal.net_kobo != null ? Number(withdrawal.net_kobo) : Number(withdrawal.amount_kobo);
    const updated = await initiateTransferAndRecord({
      withdrawalId: id,
      amountKobo: netKobo,
      recipientCode: withdrawal.recipient_code,
      reference: withdrawal.reference,
      ownerType: withdrawal.owner_type,
    });

    await sql`
      UPDATE withdrawals SET approved_by = ${admin.id}, updated_at = NOW() WHERE id = ${id}
    `;
    await auditLog({
      userId: admin.id,
      action: "withdrawal.approve",
      entityType: "withdrawal",
      entityId: id,
      meta: {
        ownerType: withdrawal.owner_type,
        ownerId: withdrawal.owner_id,
        amountKobo: Number(withdrawal.amount_kobo),
      },
    });

    return NextResponse.json(ok({ status: updated.status }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}