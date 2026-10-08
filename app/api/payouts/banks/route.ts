import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { listBanks } from "@/server/payments/transfers";

let cachedAt = 0;
let cached: { name: string; slug: string; code: string }[] | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Bank list for any payout form (affiliate signup, vendor, rider). Cached 24h.
 *  Any signed-in user may read it: affiliate signup runs as CUSTOMER, and the
 *  list itself is public reference data (secret key stays server-side). */
export async function GET(request: NextRequest) {
  try {
    await requireSession(request);
    if (!cached || Date.now() - cachedAt > CACHE_TTL_MS) {
      const banks = await listBanks();
      cached = banks.map((bank) => ({ name: bank.name, slug: bank.slug, code: bank.code }));
      cachedAt = Date.now();
    }
    return NextResponse.json(ok(cached));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}