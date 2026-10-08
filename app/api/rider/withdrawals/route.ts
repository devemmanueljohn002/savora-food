import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { ROLES, requireRole } from "@/server/auth/guard";
import { getRiderContext } from "@/server/riders";
import { getPayoutOverview, toWithdrawalResponse, withdraw } from "@/server/payouts";
import { assertSameOrigin } from "@/server/csrf";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import type { Owner } from "@/server/wallet";

const bodySchema = z.object({
  // Integer kobo from the client; the server re-validates it against the
  // per-rider policy and the locked wallet balance.
  amountKobo: z.number().int().positive(),
  // Client-generated id per submit; REQUIRED so a timeout-then-retry reuses
  // the same key instead of minting a second debit.
  idempotencyKey: z.string().trim().min(1).max(100),
  // 6-digit email OTP from POST /rider/withdrawals/otp (single-use).
  otpCode: z.string().trim().max(10).optional().nullable(),
});

/** Rider wallet + limits + bank account + withdrawal history.
 *  Owner id always comes from the session's rider profile. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER]);
    const rider = await getRiderContext(session.id);
    const owner: Owner = { type: "RIDER", id: rider.id };
    return NextResponse.json(ok(await getPayoutOverview(owner)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

/** Rider withdrawal request — the shared payout service, not a rider copy. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER]);
    const rider = await getRiderContext(session.id);
    const throttle = checkRateLimit(`rl:withdraw:${session.id}`, 20);
    if (!throttle.ok) return rateLimitedResponse(throttle.retryAfter);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const owner: Owner = { type: "RIDER", id: rider.id };
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