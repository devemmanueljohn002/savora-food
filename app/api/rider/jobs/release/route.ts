import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderByUserId } from "@/server/riders";
import { getBoardConfig, releaseBoardJob } from "@/server/dispatch";
import { notifyWithEmail } from "@/server/notify";
import { db } from "@/server/db";

const releaseSchema = z.object({
  deliveryId: z.string().uuid("Invalid delivery."),
});

/**
 * Release a claimed job back to the board (before pickup only). The job
 * reopens for every other rider; the releasing rider auto-dismisses it.
 * Riders who release repeatedly are flagged to admins.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER]);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");
    const parsed = releaseSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    const config = await getBoardConfig();
    const outcome = await releaseBoardJob(
      parsed.data.deliveryId,
      { id: rider.id, user_id: rider.user_id, name: rider.name },
      config.releaseFlagThreshold,
    );
    if (!outcome.ok) {
      throw ApiError.conflict(
        outcome.reason === "too_late"
          ? "This job can no longer be released after pickup."
          : "Delivery not found.",
      );
    }
    const parties = await db()<{
      customer_user_id: string;
      vendor_user_id: string | null;
      order_number: string;
    }[]>`
      SELECT o.user_id AS customer_user_id, v.user_id AS vendor_user_id, o.order_number
      FROM orders o JOIN vendors v ON v.id = o.vendor_id
      WHERE o.id = ${outcome.orderId} LIMIT 1
    `;
    if (parties[0]) {
      await notifyWithEmail(parties[0].customer_user_id, {
        title: `Order ${parties[0].order_number} needs a new rider`,
        body: "Your rider released this delivery before pickup. It is back on the board and another rider will be assigned shortly.",
        data: { orderId: outcome.orderId, status: "READY_FOR_PICKUP" },
      });
      if (parties[0].vendor_user_id) {
        await notifyWithEmail(parties[0].vendor_user_id, {
          title: `Rider released ${parties[0].order_number}`,
          body: `${rider.name} released the delivery before pickup. The order is back on the board.`,
          data: { orderId: outcome.orderId, status: "READY_FOR_PICKUP" },
        });
      }
    }
    return NextResponse.json(ok({ released: true, orderId: outcome.orderId }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
