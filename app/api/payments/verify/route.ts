import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import {
  findPaymentByReference,
  getOrderForUser,
  markOrderPaymentPaid,
  toKobo,
} from "@/server/orders";
import { paystackMismatchReason, verifyPaystackReference } from "@/server/payments/paystack";

const PAID_PROGRESSION = new Set([
  "PAID",
  "VENDOR_ACCEPTED",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "RIDER_ASSIGNED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]);

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

    // Idempotent replay: verify + webhook both arriving (or a double-click on
    // the Paystack callback) is success, not an error — as long as the stored
    // payment row already shows SUCCESS for this same reference.
    if (PAID_PROGRESSION.has(order.status) && payment.status === "SUCCESS") {
      return NextResponse.json(
        ok({
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paid: true,
          reference,
        }),
      );
    }
    // Order progressed past PAID but this reference was never marked SUCCESS
    // (e.g. webhook won with a different reference): do NOT attest paid for
    // a reference that did not pay. Fall through to server-side verification
    // of the supplied reference below.

    // Never trust the client's redirect alone: confirm server-side with
    // Paystack's verify API and require an exact match on status + reference
    // + amount (kobo) + currency before flipping anything.
    const result = await verifyPaystackReference(reference);
    const mismatch = paystackMismatchReason(result, {
      reference,
      amountKobo: toKobo(order.total),
      currency: order.currency ?? "NGN",
    });
    if (mismatch) {
      throw ApiError.validation(mismatch);
    }

    // Paystack says success but our flip failed (race loser already handled
    // inside markOrderPaymentPaid; anything else is infra): the customer WAS
    // charged, so report "received, confirming" with the reference instead of
    // "verification failed". The webhook (source of truth) or a retry will
    // complete the flip; support can reconcile by reference.
    try {
      await markOrderPaymentPaid(order.id, user.id, reference);
    } catch (error) {
      console.error("[payments/verify] Paystack success but order update failed:", {
        reference,
        orderId: order.id,
        error,
      });
      return NextResponse.json(
        ok({
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: "PENDING_PAYMENT" as const,
          paid: false,
          pendingConfirmation: true,
          reference,
          message: `Payment received, confirming your order (ref ${reference}).`,
        }),
      );
    }

    const fresh = await getOrderForUser(user.id, order.id);
    return NextResponse.json(
      ok({
        orderId: fresh.id,
        orderNumber: fresh.orderNumber,
        status: fresh.status,
        paid: PAID_PROGRESSION.has(fresh.status),
        reference,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
