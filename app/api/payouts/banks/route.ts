import { NextResponse } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { listBanks } from "@/server/payments/transfers";

let cachedAt = 0;
let cached: { name: string; slug: string; code: string }[] | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Bank list for any payout form (affiliate signup, vendor, rider). Cached 24h.
 *  Public: no session required. This is non-sensitive reference data — anyone,
 *  including logged-out visitors on the affiliate signup page, may read it.
 *  The Paystack secret key stays server-side (used only in transfers.ts). */
export async function GET() {
  try {
    if (!cached || Date.now() - cachedAt > CACHE_TTL_MS) {
      const banks = await listBanks();
      cached = banks
        .map((bank) => ({ name: bank.name, slug: bank.slug, code: bank.code }))
        .sort((a, b) => a.name.localeCompare(b.name));
      cachedAt = Date.now();
    }
    return NextResponse.json(ok(cached));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}