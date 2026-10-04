import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderByUserId } from "@/server/riders";
import { claimBoardJob, claimConflictMessage, getBoardConfig } from "@/server/dispatch";
import { notifyWithEmail } from "@/server/notify";

const acceptSchema = z.object({
  orderId: z.string().uuid("Invalid order."),
});

/**
 * Claim a board job. Rider role only. Atomic first-claim-wins: the
 * conditional UPDATE inside claimBoardJob lets exactly one concurrent
 * claimer take the row — losers get 409 "Job already taken". On success the
 * winner receives full pickup + drop-off details.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER]);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");
    const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const config = await getBoardConfig();
    const outcome = await claimBoardJob(
      parsed.data.orderId,
      { id: rider.id, user_id: rider.user_id, name: rider.name, current_zone: rider.current_zone },
      config.maxActiveJobs,
    );
    if (!outcome.ok) {
      if (outcome.reason === "area") {
        throw ApiError.forbidden(claimConflictMessage(outcome.reason));
      }
      throw ApiError.conflict(claimConflictMessage(outcome.reason));
    }
    const detail = outcome.detail;

    const { db } = await import("@/server/db");
    const vendorOwners = await db()<{ user_id: string; vendor_id: string }[]>`
      SELECT v.user_id, v.id AS vendor_id FROM vendors v
      JOIN orders o ON o.vendor_id = v.id
      WHERE o.id = ${detail.orderId} LIMIT 1
    `;
    const customerRows = await db()<{ user_id: string }[]>`
      SELECT user_id FROM orders WHERE id = ${detail.orderId} LIMIT 1
    `;

    if (customerRows[0]) {
      await notifyWithEmail(customerRows[0].user_id, {
        title: `Rider assigned to ${detail.orderNumber}`,
        body: `${rider.name} claimed your delivery and is getting ready. Share your delivery code with the rider at drop-off.`,
        data: { orderId: detail.orderId, status: "RIDER_ASSIGNED" },
      });
    }
    if (vendorOwners[0]) {
      await notifyWithEmail(vendorOwners[0].user_id, {
        title: `Rider assigned: ${detail.orderNumber}`,
        body: `${rider.name} claimed the delivery and is heading to your kitchen.`,
        data: { orderId: detail.orderId, status: "RIDER_ASSIGNED" },
      });
    }

    return NextResponse.json(ok(detail), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
