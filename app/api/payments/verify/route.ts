import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { findPaymentByReference, getOrderForUser, markOrderPaymentPaid } from "@/server/orders";
import { verifyPaystackReference } from "@/server/payments/paystack";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const reference = request.nextUrl.searchParams.get("reference")?.trim();

    if (!reference) {
      throw ApiError.validation("Missing payment reference.");
    }

    const payment = await findPaymentByReference(reference);
    if (!payment) {
      throw ApiError.notFound("Payment not found.");
    }

    const order = await getOrderForUser(user.id, payment.order_id);

    let paid = order.status !== "PENDING_PAYMENT";
    if (!paid) {
      const result = await verifyPaystackReference(reference);
      if (result.status === "success") {
        await markOrderPaymentPaid(order.id, user.id);
        paid = true;
      }
    }

    return NextResponse.json(
      ok({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: paid ? ("PAID" as const) : order.status,
        paid,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}