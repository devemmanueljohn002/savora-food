import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { requireAffiliate } from "@/server/affiliates";
import { getPayoutAccount, savePayoutAccount } from "@/server/payouts";
import type { Owner } from "@/server/wallet";

const saveSchema = z.object({
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit account number."),
  bankCode: z.string().trim().min(1, "Select a bank.").max(20),
});

/** The affiliate's saved transfer recipient (if any) + cooling state. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const affiliate = await requireAffiliate(session.id);
    const owner: Owner = { type: "AFFILIATE", id: affiliate.id };
    return NextResponse.json(ok(await getPayoutAccount(owner)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

/** Verify + save the affiliate's bank account (same Paystack flow as vendors/riders). */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const affiliate = await requireAffiliate(session.id);
    const parsed = saveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    const owner: Owner = { type: "AFFILIATE", id: affiliate.id };
    const saved = await savePayoutAccount(owner, parsed.data);
    return NextResponse.json(ok(saved), { status: saved.reused ? 200 : 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
