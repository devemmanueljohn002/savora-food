import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireAdminUser } from "@/server/admin";
import { auditLog } from "@/server/admin";

/**
 * Admin-triggered reconcile for orders stuck in PENDING_PAYMENT.
 * Same server-side verification + atomic flip as the webhook; safe to retry.
 */
const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  reference: z.string().trim().min(1).max(64).optional(),
  dryRun: z.coerce.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request);
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      throw ApiError.validation("Invalid reconcile query.", parsed.error.flatten().fieldErrors);
    }
    const { reconcileStuckPayments } = await import("@/server/payments/reconcile");
    const result = await reconcileStuckPayments({
      limit: parsed.data.limit,
      reference: parsed.data.reference,
      dryRun: parsed.data.dryRun,
    });
    if (!parsed.data.dryRun) {
      await auditLog({
        userId: admin.id,
        action: "payments.reconcile",
        meta: { checked: result.checked, confirmed: result.confirmed },
      }).catch(() => undefined);
    }
    return NextResponse.json(ok({ ...result, dryRun: parsed.data.dryRun ?? false }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
