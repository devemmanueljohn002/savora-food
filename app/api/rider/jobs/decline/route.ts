import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderContext } from "@/server/riders";
import { createDispatchOffers } from "@/server/dispatch";
import { db } from "@/server/db";

const declineSchema = z.object({
  orderId: z.string().uuid("Invalid order."),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER, ROLES.ADMIN]);
    const rider = await getRiderContext(session.id, false);
    const parsed = declineSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    await db()`
      UPDATE delivery_offers SET status = 'DECLINED', responded_at = NOW()
      WHERE order_id = ${parsed.data.orderId} AND delivery_partner_id = ${rider.id} AND status = 'OFFERED'
    `;
    // Escalate: offer to the next eligible riders.
    await createDispatchOffers(parsed.data.orderId).catch(() => undefined);
    return NextResponse.json(ok({ declined: true }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
