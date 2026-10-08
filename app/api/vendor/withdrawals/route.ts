import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { getPayoutOverview, toWithdrawalResponse, withdraw } from "@/server/payouts";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import type { Owner } from "@/server/wallet";

const bodySchema = z.object({
  // Integer kobo from the client; re-validated server-side against the
  // per-owner policy and the locked balance.
  amountKobo: z.number().int().positive(),
  // Client-generated id per submit; REQUIRED so a timeout-then-retry reuses
  // the same key instead of minting a second debit. The frontend mints one
  // UUID per submit attempt and reuses it across retries.
  idempotencyKey: z.string().trim().min(1).max(100),
  // 6-digit email OTP from POST /vendor/withdrawals/otp (single-use).
  otpCode: z.string().trim().max(10).optional().nullable(),
});

/** Withdrawal history + wallet for the authenticated vendor. The owner id comes
 *  from the session, never from the request body. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const owner: Owner = { type: "VENDOR", id: vendor.id };
    return NextResponse.json(ok(await getPayoutOverview(owner)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

/**
 * Vendor withdrawal request. Delegates to the shared owner-agnostic payout
 * service — vendor and rider rails differ only in the owner row.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const throttle = checkRateLimit(`rl:withdraw:${session.id}`, 20);
    if (!throttle.ok) return rateLimitedResponse(throttle.retryAfter);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const owner: Owner = { type: "VENDOR", id: vendor.id };
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