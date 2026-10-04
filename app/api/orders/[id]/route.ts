import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { getOrderForUser, releaseStalePaidOrders } from "@/server/orders";

/** Authenticated order detail for the owner (includes delivery code + fee breakdown). */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { id } = await ctx.params;
    // A stuck PAID order is released the moment its owner looks at it.
    await releaseStalePaidOrders(5).catch(() => undefined);
    const order = await getOrderForUser(user.id, id);
    return NextResponse.json(ok(order));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
