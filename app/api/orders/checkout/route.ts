import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { createOrdersFromCart, expireStalePendingPayments } from "@/server/orders";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import { AFFILIATE_COOKIE, attachAffiliateToOrders, getReferredAffiliate, normalizeReferralCode, resolveAttributionCode, resolveCheckoutReferrer } from "@/server/affiliates";

const bodySchema = z.object({
  addressId: z.string().uuid(),
  deliveryInstructions: z.string().trim().max(2000).optional(),
  couponCode: z.string().trim().min(1).max(50).optional(),
  // Referral code typed at checkout — beats the referral-link cookie.
  referralCode: z.string().trim().max(16).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const throttle = checkRateLimit(`rl:checkout:${user.id}`, 30);
    if (!throttle.ok) return rateLimitedResponse(throttle.retryAfter);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Invalid checkout request.", parsed.error.flatten().fieldErrors);
    }

    const { addressId, deliveryInstructions, couponCode } = parsed.data;
    // Reap this shopper's own expired unpaid checkouts first (frees stock).
    await expireStalePendingPayments(user.id, 20).catch(() => undefined);
    const result = await createOrdersFromCart(user.id, addressId, deliveryInstructions || undefined, couponCode);

    // Affiliate attribution for NEW referrals only: the referrer was saved
    // on the user at signup (once, never changed). An existing account that
    // merely opens /ref/[code] has no saved referrer and is never attached;
    // foreign typed codes and cookies are ignored. The commission itself is
    // only created once the order reaches DELIVERED. An explicitly typed
    // code is validated loudly (e.g. your own code); cookie failures
    // never fail checkout.
    const savedReferrer = await getReferredAffiliate(user.id).catch(() => null);
    const typed = parsed.data.referralCode?.trim()
      ? normalizeReferralCode(parsed.data.referralCode)
      : null;
    const wanted = resolveAttributionCode(typed, request.cookies.get(AFFILIATE_COOKIE)?.value ?? null);
    const code = savedReferrer ? resolveCheckoutReferrer(savedReferrer.code, wanted) : null;
    if (code) {
      if (typed) {
        await attachAffiliateToOrders({
          orderIds: result.orders.map((order) => order.id),
          userId: user.id,
          code,
        });
      } else {
        try {
          await attachAffiliateToOrders({
            orderIds: result.orders.map((order) => order.id),
            userId: user.id,
            code,
          });
        } catch {
          // Cookie attribution is best-effort — checkout still succeeds.
        }
      }
    }
    return NextResponse.json(ok(result));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}