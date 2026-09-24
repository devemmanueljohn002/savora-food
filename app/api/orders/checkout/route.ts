import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { createOrdersFromCart } from "@/server/orders";

const bodySchema = z.object({
  addressId: z.string().uuid(),
  deliveryInstructions: z.string().trim().max(2000).optional(),
  couponCode: z.string().trim().min(1).max(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Invalid checkout request.", parsed.error.flatten().fieldErrors);
    }

    const { addressId, deliveryInstructions, couponCode } = parsed.data;
    const result = await createOrdersFromCart(user.id, addressId, deliveryInstructions || undefined, couponCode);
    return NextResponse.json(ok(result));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}