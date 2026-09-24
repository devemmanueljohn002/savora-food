import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { findPaymentByReference, markOrderPaymentPaid } from "@/server/orders";
import { verifyPaystackReference, verifyWebhookSignature } from "@/server/payments/paystack";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function extractReference(payload: Record<string, unknown>): string | null {
  const data = asRecord(payload.data);
  if (!data) return null;
  const payment = asRecord(data.payment);
  const paymentOrder = asRecord(data.payment_order);

  return (
    firstString(data.reference) ??
    firstString(data.paystack_reference) ??
    firstString(payment?.reference) ??
    firstString(payment?.paystack_reference) ??
    firstString(paymentOrder?.reference) ??
    null
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  try {
    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ success: false, message: "Invalid signature." }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const reference = extractReference(payload);
    if (!reference) {
      return NextResponse.json({ success: true, message: "No payment reference in event." });
    }

    const payment = await findPaymentByReference(reference);
    if (!payment) {
      return NextResponse.json({ success: true, message: "Unmatched payment reference." });
    }
    if (payment.status === "SUCCESS") {
      return NextResponse.json({ success: true, message: "Already confirmed." });
    }

    const result = await verifyPaystackReference(reference);
    if (result.status !== "success") {
      return NextResponse.json({ success: true, message: `Payment not successful: ${result.status}` });
    }

    const sql = db();
    const owner = await sql<{ user_id: string }[]>`
      SELECT user_id FROM orders WHERE id = ${payment.order_id} LIMIT 1
    `;
    if (owner.length === 0) {
      return NextResponse.json({ success: true, message: "Order not found." });
    }

    await markOrderPaymentPaid(payment.order_id, owner[0].user_id);
    return NextResponse.json({ success: true, message: "Payment confirmed." });
  } catch (error) {
    console.error("[webhook] paystack handling error:", error);
    return NextResponse.json({ success: false, message: "Webhook processing failed." }, { status: 500 });
  }
}