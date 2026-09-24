import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { getEnv } from "@/server/env";
import { getOrderForUser } from "@/server/orders";
import { createPaymentRecord, generatePaymentReference, initializePaystack, markPaymentFailed } from "@/server/payments/paystack";

const bodySchema = z.object({
  orderId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Invalid payment request.", parsed.error.flatten().fieldErrors);
    }

    const order = await getOrderForUser(user.id, parsed.data.orderId);
    if (order.status !== "PENDING_PAYMENT") {
      throw ApiError.conflict("This order has already been paid.");
    }

    const reference = generatePaymentReference();
    await createPaymentRecord({ orderId: order.id, reference, amount: order.total });

    const callbackUrl = `${getEnv().appUrl}/checkout?paystack=verify&reference=${encodeURIComponent(reference)}`;
    try {
      const result = await initializePaystack({
        amountNaira: order.total,
        email: user.email,
        callbackUrl,
        reference,
        extraMetadata: { orderId: order.id, orderNumber: order.orderNumber },
      });

      return NextResponse.json(
        ok({
          orderId: order.id,
          orderNumber: order.orderNumber,
          reference: result.reference,
          authorizationUrl: result.authorizationUrl,
          amount: order.total,
          currency: "NGN",
        }),
      );
    } catch (error) {
      await markPaymentFailed(reference).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}