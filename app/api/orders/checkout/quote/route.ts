import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { quoteCheckout } from "@/server/orders";

const bodySchema = z.object({
  addressId: z.string().uuid().optional(),
  couponCode: z.string().trim().min(1).max(50).optional(),
});

/** Checkout preview: per-vendor totals with coupon math, no orders created. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Invalid quote request.", parsed.error.flatten().fieldErrors);
    }

    const quote = await quoteCheckout(user.id, parsed.data.addressId, parsed.data.couponCode);
    return NextResponse.json(ok(quote));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
