import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { getEnv } from "@/server/env";
import { db } from "@/server/db";
import { verifyUnsubscribeToken } from "@/server/email/unsubscribe";

const bodySchema = z.object({
  token: z.string().trim().min(1, "Missing unsubscribe token."),
  // false (default) = opt out of order update emails; true = resubscribe.
  resubscribe: z.boolean().optional().default(false),
});

/**
 * One-click unsubscribe from order update emails. The token is HMAC-signed
 * per user, so no session is needed — the link works straight from an inbox.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    const userId = verifyUnsubscribeToken(parsed.data.token, getEnv().jwtSecret);
    if (!userId) {
      throw ApiError.validation("This unsubscribe link is invalid or has expired.");
    }
    const optOut = !parsed.data.resubscribe;
    const rows = await db()<{ id: string }[]>`
      UPDATE users SET email_updates_opt_out = ${optOut}, updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id
    `;
    if (!rows[0]) throw ApiError.notFound("Account not found.");
    return NextResponse.json(ok({ optedOut: optOut }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
