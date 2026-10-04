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

function eventKeyFor(payload: Record<string, unknown>, event: string, reference: string | null): string {
  const data = asRecord(payload.data);
  const paystackId = data ? (firstString(data.id) ?? (typeof data.id === "number" ? String(data.id) : null)) : null;
  if (paystackId) return `paystack:${paystackId}`;
  return `fallback:${event}:${reference ?? "noref"}`;
}

function extractTransferFields(payload: Record<string, unknown>): {
  reference: string | null;
  transferCode: string | null;
  paystackStatus: string | null;
  failureReason: string | null;
} {
  const data = asRecord(payload.data) ?? {};
  return {
    reference: firstString(data.reference) ?? null,
    transferCode: firstString(data.transfer_code) ?? null,
    paystackStatus: firstString(data.status) ?? null,
    failureReason: firstString(data.reason) ?? firstString(data.gateway_response) ?? null,
  };
}

async function handleTransferEvent(
  payload: Record<string, unknown>,
  event: string,
): Promise<NextResponse> {
  const { applyTransferWebhook } = await import("@/server/wallet");
  const fields = extractTransferFields(payload);
  if (!fields.reference) {
    return NextResponse.json({ success: true, message: "Transfer event without reference." });
  }

  const sql = db();
  const eventKey = eventKeyFor(payload, event, fields.reference);

  // Idempotency: first delivery wins, replays are no-ops.
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO paystack_webhook_events (event_key, event, reference, payload)
    VALUES (${eventKey}, ${event}, ${fields.reference}, ${sql.json(JSON.parse(JSON.stringify(payload)))})
    ON CONFLICT (event_key) DO NOTHING
    RETURNING id
  `;
  if (inserted.length === 0) {
    return NextResponse.json({ success: true, message: "Duplicate event ignored." });
  }

  const withdrawal = await applyTransferWebhook({
    event,
    reference: fields.reference,
    transferCode: fields.transferCode,
    paystackStatus: fields.paystackStatus,
    failureReason: fields.failureReason,
  });
  if (!withdrawal) {
    return NextResponse.json({ success: true, message: "Unmatched withdrawal reference." });
  }
  return NextResponse.json({ success: true, message: `Withdrawal ${withdrawal.status}.` });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  try {
    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ success: false, message: "Invalid signature." }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const event = typeof payload.event === "string" ? payload.event : "";

  // Payout rail (vendor AND rider withdrawals). The webhook is the source of
  // truth for final status — failed/reversed events restore the owner's balance.
    if (event.startsWith("transfer.")) {
      return handleTransferEvent(payload, event);
    }

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

    // Idempotency, claimed only after verification succeeds: concurrent
    // duplicate charge events lose here; the winner processes, replays are
    // no-ops. Same event_key scheme as transfers. Claiming earlier would
    // burn the key on a premature event and block the later good one.
    const sql = db();
    const chargeKey = eventKeyFor(payload, event, reference);
    const claimed = await sql<{ id: string }[]>`
      INSERT INTO paystack_webhook_events (event_key, event, reference, payload)
      VALUES (${chargeKey}, ${event}, ${reference}, ${sql.json(JSON.parse(JSON.stringify(payload)))})
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
    `;
    if (claimed.length === 0) {
      return NextResponse.json({ success: true, message: "Duplicate event ignored." });
    }

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