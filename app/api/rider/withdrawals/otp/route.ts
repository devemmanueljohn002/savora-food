import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { ROLES, requireRole } from "@/server/auth/guard";
import { getRiderContext } from "@/server/riders";
import { requestWithdrawalOtp } from "@/server/withdrawal-otp";
import type { Owner } from "@/server/wallet";

/** Send a 6-digit email OTP that the rider withdrawal POST must present. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER]);
    const rider = await getRiderContext(session.id);
    const owner: Owner = { type: "RIDER", id: rider.id };
    const result = await requestWithdrawalOtp(owner, session.id);
    return NextResponse.json(ok({ expiresAt: result.expiresAt }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
