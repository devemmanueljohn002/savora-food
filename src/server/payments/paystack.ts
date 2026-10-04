import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "../db";
import { getEnv } from "../env";
import { ApiError } from "../errors";
import { toKobo } from "../orders";

const PAYSTACK_API = "https://api.paystack.co";

function requireSecretKey(): string {
  const secret = getEnv().paystackSecretKey;
  if (!secret) {
    throw ApiError.paymentError("Payments are not configured on this server.");
  }
  return secret;
}

type PaystackData = {
  authorization_url?: string;
  access_code?: string;
  reference?: string;
  status?: string;
  amount?: number;
  paid_at?: string | null;
  [key: string]: unknown;
};

type PaystackEnvelope = {
  status: boolean;
  message?: string;
  data: PaystackData;
};

async function paystackFetch(
  path: string,
  init: RequestInit & { fetchImpl?: FetchImpl } = {},
): Promise<{ status: number; body: PaystackEnvelope }> {
  const secret = requireSecretKey();
  const fetchImpl = init.fetchImpl ?? fetch;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  headers.set("Accept", "application/json");
  if (init.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  const { fetchImpl: _ignored, ...fetchInit } = init;
  const response = await fetchImpl(`${PAYSTACK_API}${path}`, { ...fetchInit, headers });
  const body = (await response.json().catch(() => null)) as Partial<PaystackEnvelope> | null;

  if (!response.ok || !body || body.status === false) {
    const message = body?.message ?? `Paystack returned an error (${response.status}).`;
    throw new ApiError("PAYMENT_ERROR", message);
  }

  return { status: response.status, body: body as PaystackEnvelope };
}

export type FetchImpl = typeof fetch;

export type PaystackInitializeArgs = {
  amountNaira: number;
  email: string;
  callbackUrl: string;
  reference: string;
  extraMetadata?: Record<string, unknown>;
};

export type PaystackInitializeResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export function generatePaymentReference(): string {
  return `SV-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export async function initializePaystack(args: PaystackInitializeArgs): Promise<PaystackInitializeResult> {
  const { amountNaira, email, callbackUrl, reference, extraMetadata } = args;
  const { body } = await paystackFetch("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      amount: toKobo(amountNaira),
      email,
      currency: "NGN",
      reference,
      callback_url: callbackUrl,
      metadata: {
        source: "savora-food",
        ...extraMetadata,
      },
    }),
  });

  return {
    authorizationUrl: body.data.authorization_url ?? "",
    accessCode: body.data.access_code ?? "",
    reference: body.data.reference ?? reference,
  };
}

export type PaystackVerifyResult = {
  status: "success" | "abandoned" | "failed" | string;
  amount: number | null;
  paidAt: string | null;
};

export async function verifyPaystackReference(reference: string): Promise<PaystackVerifyResult> {
  const { body } = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
  const data = body?.data ?? {};
  return {
    status: data.status ?? "unknown",
    amount: typeof data.amount === "number" ? data.amount : null,
    paidAt: typeof data.paid_at === "string" ? data.paid_at : null,
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = requireSecretKey();
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const suppliedBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function createPaymentRecord(input: {
  orderId: string;
  reference: string;
  amount: number;
}): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO payments (order_id, payment_reference, provider, status, amount, currency, raw_payload)
    VALUES (${input.orderId}, ${input.reference}, 'PAYSTACK', 'PENDING', ${input.amount}, 'NGN', '{}')
  `;
}

export async function markPaymentFailed(reference: string): Promise<void> {
  const sql = db();
  await sql`
    UPDATE payments
    SET status = 'FAILED'
    WHERE payment_reference = ${reference} AND status = 'PENDING'
  `;
}

export type RefundPaystackResult = {
  status: string;
  refundReference: string | null;
};

/**
 * Real money-out refund via Paystack (`POST /refund`). Full-order refunds
 * pass no amount (Paystack refunds the transaction total).
 * Throws ApiError PAYMENT_ERROR when Paystack rejects — callers record the
 * failure on the refunds row so support can follow up manually.
 */
export async function refundPaystackTransaction(
  input: { reference: string; amountKobo?: number | null },
  fetchImpl?: FetchImpl,
): Promise<RefundPaystackResult> {
  const body: Record<string, unknown> = { transaction: input.reference };
  if (input.amountKobo !== undefined && input.amountKobo !== null) {
    if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
      throw ApiError.validation("Invalid refund amount.");
    }
    body.amount = input.amountKobo;
  }
  const { body: envelope } = await paystackFetch("/refund", {
    method: "POST",
    body: JSON.stringify(body),
    fetchImpl,
  });
  const data = (envelope?.data ?? {}) as { status?: unknown; refund_reference?: unknown; reference?: unknown };
  return {
    status: typeof data.status === "string" ? data.status : "unknown",
    refundReference:
      typeof data.refund_reference === "string"
        ? data.refund_reference
        : typeof data.reference === "string"
          ? data.reference
          : null,
  };
}