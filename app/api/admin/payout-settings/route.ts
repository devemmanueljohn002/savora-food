import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";
import { getPayoutSettings } from "@/server/money";

const patchSchema = z.object({
  min_withdrawal_kobo: z.number().int().min(0).max(100_000_000).optional(),
  rider_min_withdrawal_kobo: z.number().int().min(0).max(100_000_000).optional(),
  max_withdrawal_kobo: z.number().int().min(0).max(1_000_000_000).optional(),
  rider_max_withdrawal_kobo: z.number().int().min(0).max(1_000_000_000).optional(),
  auto_approve_below_kobo: z.number().int().min(0).max(1_000_000_000).optional(),
  rider_auto_approve_below_kobo: z.number().int().min(0).max(1_000_000_000).optional(),
  hold_days: z.number().int().min(0).max(30).optional(),
  rider_hold_days: z.number().int().min(0).max(30).optional(),
  vendor_daily_withdrawal_limit: z.number().int().min(1).max(20).optional(),
  rider_daily_withdrawal_limit: z.number().int().min(1).max(20).optional(),
  transfer_fee_kobo: z.number().int().min(0).max(1_000_000).optional(),
  transfer_fee_bearer: z.enum(["USER", "SAVORA"]).optional(),
  payout_approval_mode: z.enum(["AUTO", "MANUAL"]).optional(),
  bank_change_cooling_hours: z.number().int().min(1).max(168).optional(),
  // Affiliate knobs (all CONFIGURABLE).
  affiliate_min_withdrawal_kobo: z.number().int().min(0).max(100_000_000).optional(),
  affiliate_max_withdrawal_kobo: z.number().int().min(0).max(1_000_000_000).optional(),
  affiliate_auto_approve_below_kobo: z.number().int().min(0).max(1_000_000_000).optional(),
  affiliate_daily_withdrawal_limit: z.number().int().min(1).max(20).optional(),
  affiliate_hold_days: z.number().int().min(0).max(30).optional(),
  affiliate_commission_mode: z.enum(["PERCENT", "FLAT"]).optional(),
  affiliate_commission_pct: z.number().min(0).max(100).optional(),
  affiliate_commission_flat_kobo: z.number().int().min(0).max(100_000_000).optional(),
  affiliate_base_excludes_delivery_fee: z.boolean().optional(),
  affiliate_base_subtracts_discount: z.boolean().optional(),
  affiliate_attribution_days: z.number().int().min(1).max(90).optional(),
});

/**
 * Admin view/edit of every CONFIGURABLE withdrawal knob. Single admin role
 * only (requireAdminUser) — no separate finance role. Values live in
 * platform_settings.payout_config so no redeploy is needed.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    return NextResponse.json(ok(await getPayoutSettings()));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request);
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Provide at least one setting to update.", parsed.success ? undefined : parsed.error.flatten().fieldErrors);
    }
    const sql = db();
    const current = await getPayoutSettings();
    const merged = { ...current, ...parsed.data };
    await sql`
      INSERT INTO platform_settings (key, value)
      VALUES ('payout_config', ${sql.json(JSON.parse(JSON.stringify(merged)))})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    await auditLog({
      userId: admin.id,
      action: "payout_settings.update",
      entityType: "platform_settings",
      entityId: "payout_config",
      meta: parsed.data as Record<string, unknown>,
    });
    return NextResponse.json(ok(merged));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
