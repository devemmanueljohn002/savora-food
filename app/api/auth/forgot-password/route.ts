import { NextResponse } from "next/server";
import { z } from "zod";
import { okMessage, toEnvelope } from "@/server/errors";
import { RESET_MINUTES, sendPasswordResetEmail } from "@/server/email";
import { getEnv } from "@/server/env";
import { createPasswordResetToken, getUserByEmail } from "@/server/auth/store";
import { generateOpaqueToken, hashToken } from "@/server/auth/tokens";
import { limitByIp, rateLimitedResponse } from "@/server/rate-limit";

const forgotSchema = z.object({ email: z.email("Enter a valid email address") });

export async function POST(request: Request) {
  try {
    const limit = limitByIp(request, "forgot-password", 5);
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter);
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
        // Same constant the email wording uses (RESET_MINUTES): the link lives
        // exactly as long as the email promises.
        expiresMinutes: RESET_MINUTES,
      });
      const resetUrl = `${getEnv().appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
      try {
        await sendPasswordResetEmail(email, resetUrl);
      } catch (mailError) {
        // The token above is already stored and usable — a mail-provider
        // outage must not turn this into a 500. Log loudly for ops (this is
        // where email-delivery alerting should hook in) and still return the
        // generic success below. The response stays identical either way so
        // attackers can't probe which emails are registered. User id/email
        // stay out of production logs.
        console.error("[auth] password-reset email failed:", {
          ...(process.env.NODE_ENV === "production"
            ? {}
            : { userId: user.id, email }),
          error: mailError instanceof Error ? mailError.message : mailError,
        });
      }
    }

    return NextResponse.json(okMessage("If that email is registered, we've sent a reset link."));
  } catch (error) {
    // Log the real failure (message + stack) for ops, but always return the
    // generic envelope below — the client must not learn whether the email
    // exists or what broke internally.
    console.error("[auth] forgot-password request failed:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}