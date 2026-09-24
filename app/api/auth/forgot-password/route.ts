import { NextResponse } from "next/server";
import { z } from "zod";
import { okMessage, toEnvelope } from "@/server/errors";
import { sendPasswordResetEmail } from "@/server/email";
import { getEnv } from "@/server/env";
import { createPasswordResetToken, getUserByEmail } from "@/server/auth/store";
import { generateOpaqueToken, hashToken } from "@/server/auth/tokens";

const forgotSchema = z.object({ email: z.email("Enter a valid email address") });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = forgotSchema.safeParse(body);
    if (!parsed.success) {
      // Don't leak which emails exist: respond identically either way.
      return NextResponse.json(okMessage("If that email is registered, we've sent a reset link."));
    }

    const email = parsed.data.email;
    const user = await getUserByEmail(email);
    if (user) {
      const rawToken = generateOpaqueToken(32);
      await createPasswordResetToken({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresHours: 1,
      });
      const resetUrl = `${getEnv().appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await sendPasswordResetEmail(email, resetUrl);
    }

    return NextResponse.json(okMessage("If that email is registered, we've sent a reset link."));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}