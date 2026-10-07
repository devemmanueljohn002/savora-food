import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { getAffiliateByUserId, registerAffiliate } from "@/server/affiliates";

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
  // Bank details verified via Paystack exactly like vendors/riders.
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit account number.").optional().nullable(),
  bankCode: z.string().trim().min(1).max(20).optional().nullable(),
});

/** The caller's affiliate profile, if any. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const affiliate = await getAffiliateByUserId(session.id);
    if (!affiliate) throw ApiError.notFound("No affiliate profile found.");
    return NextResponse.json(ok(affiliate));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

/** "Become an Affiliate": full name + phone + bank details (any signed-in user). */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const parsed = registerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if ((parsed.data.accountNumber && !parsed.data.bankCode) || (!parsed.data.accountNumber && parsed.data.bankCode)) {
      throw ApiError.validation("Provide both the bank and the 10-digit account number.");
    }
    const affiliate = await registerAffiliate(session.id, {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      accountNumber: parsed.data.accountNumber,
      bankCode: parsed.data.bankCode,
    });
    return NextResponse.json(ok(affiliate), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
