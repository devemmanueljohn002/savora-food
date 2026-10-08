import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { optionalSession } from "@/server/auth/guard";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import { getVerifiedOrderTracking } from "@/server/orders";

const querySchema = z.object({
  number: z.string().trim().min(4, "Enter a valid order number").max(40, "Enter a valid order number"),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(20).optional(),
});

/**
 * Public order tracking. Order numbers are enumerable, so full tracking
 * (address, rider phone, handover code) requires either the owning session
 * or a matching order email/phone. One generic not-found message either
 * way; per-IP rate limited.
 */
export async function GET(request: NextRequest) {
  try {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";
    const limit = checkRateLimit(`track:${ip}`, 30);
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      throw ApiError.validation(parsed.error.issues[0]?.message ?? "Invalid order number.");
    }

    const session = await optionalSession(request);
    const tracking = await getVerifiedOrderTracking({
      orderNumber: parsed.data.number,
      sessionUserId: session?.id ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
    });
    if (!tracking) {
      throw ApiError.notFound("We couldn't find that order number.");
    }
    return NextResponse.json(ok(tracking));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}