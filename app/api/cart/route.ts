import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/server/auth/guard";
import { ok, okMessage, toEnvelope } from "@/server/errors";
import { clearCart, getCartView } from "@/server/queries/cart";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const cart = await getCartView(user.id);
    return NextResponse.json(ok(cart));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    await clearCart(user.id);
    return NextResponse.json(okMessage("Cart cleared."));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}