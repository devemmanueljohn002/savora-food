import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import { resolveAccount } from "@/server/payments/transfers";

/** Verify that an account number belongs to someone at the given bank. Read-only,
 *  shared by affiliate signup and vendor/rider payout forms. Any signed-in user
 *  may call it (affiliate verification happens before any role is granted). */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    // Account-name oracle throttle: any session may verify its own payout
    // account, but not enumerate arbitrary account numbers at scale.
    const throttle = checkRateLimit(`rl:bank-resolve:${session.id}`, 30);
    if (!throttle.ok) return rateLimitedResponse(throttle.retryAfter);
    const url = new URL(request.url);
    const accountNumber = url.searchParams.get("account_number")?.trim() ?? "";
    const bankCode = url.searchParams.get("bank_code")?.trim() ?? "";
    if (!/^\d{10}$/.test(accountNumber)) {
      throw ApiError.validation("Enter a valid 10-digit account number.");
    }
    if (!bankCode) {
      throw ApiError.validation("Select a bank.");
    }
    const result = await resolveAccount({ accountNumber, bankCode });
    return NextResponse.json(ok(result));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}