import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { removeCartItem, setCartItemQuantity } from "@/server/queries/cart";

const patchSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(99),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { itemId } = await ctx.params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Invalid quantity.", parsed.error.flatten().fieldErrors);
    }

    const cart = await setCartItemQuantity(user.id, itemId, parsed.data.quantity);
    return NextResponse.json(ok(cart));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { itemId } = await ctx.params;
    const cart = await removeCartItem(user.id, itemId);
    return NextResponse.json(ok(cart));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}