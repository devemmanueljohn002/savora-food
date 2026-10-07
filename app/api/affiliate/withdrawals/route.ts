import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { requireAffiliate } from "@/server/affiliates";
import { getPayoutOverview, toWithdrawalResponse, withdraw } from "@/server/payouts";
import type { Owner } from "@/server/wallet";

const bodySchema = z.object({
  amountKobo: z.number().int().positive(),
  idempotencyKey: z.string().trim().max(100).optional().nullable(),
  otpCode: z.string().trim().max(10).optional().nullable(),
});

/** Affiliate Commission wallet + limits + bank account + withdrawal history. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const affiliate = await requireAffiliate(session.id);
    const owner: Owner = { type: "AFFILIATE", id: affiliate.id };
    return NextResponse.json(ok(await getPayoutOverview(owner)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

/** Affiliate withdrawal — the same shared payout service as vendors/riders. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const affiliate = await requireAffiliate(session.id);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    const owner: Owner = { type: "AFFILIATE", id: affiliate.id };
    const result = await withdraw({
      owner,
      amountKobo: parsed.data.amountKobo,
      idempotencyKey: parsed.data.idempotencyKey,
      otpCode: parsed.data.otpCode,
    });
    if (result.duplicate) {
      return NextResponse.json(ok({ ...toWithdrawalResponse(result.withdrawal), duplicate: true }));
    }
    if (result.awaitingApproval) {
      return NextResponse.json(
        ok({
          ...toWithdrawalResponse(result.withdrawal),
          message: "Withdrawal submitted and awaiting finance approval.",
        }),
        { status: 201 },
      );
    }
    return NextResponse.json(ok(toWithdrawalResponse(result.withdrawal)), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
