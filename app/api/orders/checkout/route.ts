import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { createOrdersFromCart, expireStalePendingPayments } from "@/server/orders";
import { AFFILIATE_COOKIE, attachAffiliateToOrders, normalizeReferralCode, resolveAttributionCode } from "@/server/affiliates";

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
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Invalid checkout request.", parsed.error.flatten().fieldErrors);
    }

    const { addressId, deliveryInstructions, couponCode } = parsed.data;
    // Reap this shopper's own expired unpaid checkouts first (frees stock).
    await expireStalePendingPayments(user.id, 20).catch(() => undefined);
    const result = await createOrdersFromCart(user.id, addressId, deliveryInstructions || undefined, couponCode);

    // Affiliate attribution (a code typed at checkout wins over the
    // referral-link cookie, which always holds the most recent click). The
    // commission itself is only created once the order is PAID. An explicitly
    // typed code is validated loudly (e.g. your own code); cookie failures
    // never fail checkout.
    const typed = parsed.data.referralCode?.trim()
      ? normalizeReferralCode(parsed.data.referralCode)
      : null;
    const code = resolveAttributionCode(typed, request.cookies.get(AFFILIATE_COOKIE)?.value ?? null);
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