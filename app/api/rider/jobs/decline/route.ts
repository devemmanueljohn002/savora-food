import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderByUserId } from "@/server/riders";
import { dismissBoardJob } from "@/server/dispatch";

const declineSchema = z.object({
  orderId: z.string().uuid("Invalid order."),
});

/**
 * Dismiss a board job for this rider only. Unlike the old targeted-offer
 * decline, this never touches global state: the job stays on the board for
 * every other eligible rider. Idempotent.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER]);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");
    const parsed = declineSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    await dismissBoardJob(parsed.data.orderId, rider.id);
    return NextResponse.json(ok({ dismissed: true }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
