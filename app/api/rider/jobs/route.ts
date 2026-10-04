import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderByUserId } from "@/server/riders";
import {
  boardEligibility,
  escalateUnclaimedJobs,
  findBoardJobs,
  getBoardConfig,
} from "@/server/dispatch";
import { db } from "@/server/db";

const querySchema = z.object({
  city: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

/**
 * Open board feed: every job the caller may claim. Rider role only —
 * customer/vendor tokens get 403. The serializer exposes area-level
 * drop-off info exclusively; customer identity and full addresses never
 * leave the server before a claim (see findBoardJobs).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER]);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");

    // Lazy unclaimed escalation (bounded, idempotent): boosted/flagged jobs
    // show up with their new payout on this same read.
    await escalateUnclaimedJobs(5).catch(() => undefined);

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    const { city, page, limit } = parsed.success
      ? parsed.data
      : { city: undefined, page: undefined, limit: undefined };

    const config = await getBoardConfig();
    const state = await db()<{
      status: string;
      verification_status: string;
      is_online: boolean | null;
      current_zone: string | null;
      active_deliveries: number;
    }[]>`
      SELECT dp.status, dp.verification_status, dp.is_online, dp.current_zone,
             (SELECT COUNT(*) FROM deliveries d
               WHERE d.delivery_partner_id = dp.id
                 AND d.status IN ('ASSIGNED','GOING_TO_VENDOR','ARRIVED_AT_VENDOR','PICKED_UP','IN_TRANSIT'))::int AS active_deliveries
      FROM delivery_partners dp WHERE dp.id = ${rider.id} LIMIT 1
    `;
    const gate = boardEligibility(
      {
        status: state[0]?.status ?? "",
        verification_status: state[0]?.verification_status ?? "",
        is_online: state[0]?.is_online ?? null,
        active_deliveries: state[0]?.active_deliveries ?? 0,
      },
      config.maxActiveJobs,
    );
    // Ineligible riders see an empty board (offline, unverified, or at the
    // active-job limit) — never an error, so the UI keeps polling quietly.
    if (!gate.eligible) {
      return NextResponse.json(ok([], { count: 0, total: 0, reason: gate.reason }));
    }

    const { jobs, total } = await findBoardJobs(
      { id: rider.id, current_zone: state[0]?.current_zone ?? null },
      { city, page, limit },
    );
    const pageSize = Math.min(50, Math.max(1, Math.floor(limit ?? 20)));
    return NextResponse.json(
      ok(jobs, { count: jobs.length, total, page: Math.max(1, Math.floor(page ?? 1)), pageSize }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
