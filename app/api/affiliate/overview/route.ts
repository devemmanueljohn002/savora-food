import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { getAffiliateStats, getCommissionConfig, referralLinkFor, requireAffiliate } from "@/server/affiliates";
import { getPayoutOverview } from "@/server/payouts";
import { koboToNaira } from "@/server/wallet";

/**
 * Affiliate dashboard payload (real data only): referral link + code,
 * clicks, attributed orders, earnings, wallet balances, conversion rate,
 * and the live commission rule so the UI states it honestly.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const affiliate = await requireAffiliate(session.id);
    const [stats, wallet, config] = await Promise.all([
      getAffiliateStats(affiliate.id),
      getPayoutOverview({ type: "AFFILIATE", id: affiliate.id }),
      getCommissionConfig(),
    ]);
    return NextResponse.json(
      ok({
        affiliate: {
          id: affiliate.id,
          code: affiliate.code,
          fullName: affiliate.full_name,
          phone: affiliate.phone,
          status: affiliate.status,
          referralLink: referralLinkFor(affiliate.code),
          createdAt: affiliate.created_at,
        },
        stats,
        wallet: {
          name: "Affiliate Commission",
          availableKobo: wallet.availableKobo,
          available: wallet.available,
          pendingKobo: wallet.pendingKobo,
          pending: wallet.pending,
        },
        commission: {
          mode: config.mode,
          pct: config.pct,
          flat: koboToNaira(config.flatKobo),
          flatKobo: config.flatKobo,
          baseRule: "Item subtotal only, excluding delivery fee, minus discounts.",
        },
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
