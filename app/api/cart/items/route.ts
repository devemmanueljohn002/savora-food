import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { addCartItem } from "@/server/queries/cart";

const bodySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  customInstructions: z.string().trim().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Invalid cart item.", parsed.error.flatten().fieldErrors);
    }

    const { productId, quantity, customInstructions } = parsed.data;
    const cart = await addCartItem(user.id, productId, quantity, customInstructions || undefined);
    return NextResponse.json(ok(cart));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}