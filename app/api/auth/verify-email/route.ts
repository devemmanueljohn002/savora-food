import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, okMessage, toEnvelope } from "@/server/errors";
import { consumeEmailVerificationToken, markEmailVerified } from "@/server/auth/store";
import { hashToken } from "@/server/auth/tokens";

const verifySchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const user = await consumeEmailVerificationToken(hashToken(parsed.data.token));
    if (!user) {
      throw ApiError.unauthorized("This verification link is invalid or has expired. Request a new one.");
    }

    await markEmailVerified(user.id);

    return NextResponse.json(
      okMessage("Email confirmed. Your account is fully activated."),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}