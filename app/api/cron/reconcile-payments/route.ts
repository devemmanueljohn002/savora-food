import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";

/**
 * Vercel Cron entry for stuck PENDING_PAYMENT recovery. Guarded by
 * CRON_SECRET (Bearer token) so the public can't trigger Paystack lookups.
 * Schedule in vercel.json: every 15 minutes.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (secret) {
      const supplied =
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
        request.nextUrl.searchParams.get("token")?.trim() ??
        "";
      if (supplied !== secret) {
        return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
      }
    }
    const { reconcileStuckPayments } = await import("@/server/payments/reconcile");
    const result = await reconcileStuckPayments({ limit: 50 });
    return NextResponse.json(ok(result));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
