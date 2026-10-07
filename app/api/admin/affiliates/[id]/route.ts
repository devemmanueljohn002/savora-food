import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";
import { suspendAffiliate } from "@/server/affiliates";

const actionSchema = z.object({
  action: z.enum(["suspend", "ban", "reactivate"]),
  // Required for suspend/ban — the operator must say why.
  reason: z.string().trim().max(500).optional().nullable(),
});

/** Suspend / ban (reason required) / reactivate an affiliate. Single admin role only. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    const rows = await db()<[{ id: string }][]>`SELECT id FROM affiliates WHERE id = ${id} LIMIT 1`;
    if (!rows[0]) throw ApiError.notFound("Affiliate not found.");

    const status =
      parsed.data.action === "suspend" ? "SUSPENDED" : parsed.data.action === "ban" ? "BANNED" : "ACTIVE";
    await suspendAffiliate(id, status, parsed.data.reason ?? null);
    await auditLog({
      userId: admin.id,
      action: `affiliate.${parsed.data.action}`,
      entityType: "affiliate",
      entityId: id,
      meta: { reason: parsed.data.reason ?? null },
    });
    return NextResponse.json(ok({ status }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
