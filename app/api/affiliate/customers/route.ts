import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { listReferredCustomers, requireAffiliate } from "@/server/affiliates";

/** Customers behind this affiliate's non-reversed commissions (real data only). */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const affiliate = await requireAffiliate(session.id);
    return NextResponse.json(ok(await listReferredCustomers(affiliate.id)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
