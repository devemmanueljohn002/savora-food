import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";

/**
 * Vercel Cron entry for stuck PENDING_PAYMENT recovery. Guarded by
 * CRON_SECRET (Bearer token) so the public can't trigger Paystack lookups.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when the
 * env var is set. Schedule in vercel.json: daily (Hobby plan allows only
 * once-per-day crons). For 15-minute recovery, trigger this same route
 * from an external scheduler (cron-job.org / GitHub Actions) with the
 * Bearer token.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      return NextResponse.json({ success: false, message: "Cron is not configured." }, { status: 500 });
    }
    const supplied =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    // Bearer header only — never accept the secret via ?token=: URLs land in
    // access logs. External schedulers (cron-job.org / GitHub Actions) all
    // support custom headers.
    if (supplied !== secret) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    const { reconcileStuckPayments } = await import("@/server/payments/reconcile");
    const result = await reconcileStuckPayments({ limit: 50 });
    return NextResponse.json(ok(result));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
