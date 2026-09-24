import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, okMessage, toEnvelope } from "@/server/errors";
import { getEnv } from "@/server/env";
import { sendVerificationEmail } from "@/server/email";
import { createEmailVerificationToken, getUserByEmail } from "@/server/auth/store";
import { generateOpaqueToken, hashToken } from "@/server/auth/tokens";

const resendSchema = z.object({ email: z.email("Enter a valid email address") });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = resendSchema.safeParse(body);
    if (!parsed.success) {
      // Don't leak which emails exist.
      return NextResponse.json(okMessage("If that email is registered, a verification link is on its way."));
    }

    const user = await getUserByEmail(parsed.data.email);
    if (user && !user.email_verified_at) {
      const rawToken = generateOpaqueToken(32);
      await createEmailVerificationToken({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresHours: 24,
      });
      const verifyUrl = `${getEnv().appUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
      await sendVerificationEmail(user.email, verifyUrl);
    }

    return NextResponse.json(okMessage("If that email is registered, a verification link is on its way."));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}