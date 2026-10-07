import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { requestWithdrawalOtp } from "@/server/withdrawal-otp";
import type { Owner } from "@/server/wallet";

/** Send a 6-digit email OTP that the withdrawal POST must present. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id);
    const owner: Owner = { type: "VENDOR", id: vendor.id };
    const result = await requestWithdrawalOtp(owner, session.id);
    return NextResponse.json(ok({ expiresAt: result.expiresAt }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
