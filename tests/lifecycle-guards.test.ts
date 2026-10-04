import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-for-lifecycle";
process.env.APP_URL ??= "http://localhost:3000";
process.env.PAYSTACK_SECRET_KEY ??= "sk_test_lifecycle_secret";

import {
  PENDING_PAYMENT_TIMEOUT_MINUTES,
  VENDOR_ACCEPT_TIMEOUT_MINUTES,
  resolvePendingPaymentTimeout,
  resolveVendorAcceptTimeout,
} from "@/server/orders";
import { refundPaystackTransaction } from "@/server/payments/paystack";

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("order timeout config", () => {
  it("defaults vendor accept to 30 minutes and pending payment to a day", () => {
    expect(VENDOR_ACCEPT_TIMEOUT_MINUTES).toBe(30);
    expect(PENDING_PAYMENT_TIMEOUT_MINUTES).toBe(24 * 60);
    expect(resolveVendorAcceptTimeout(null)).toBe(30);
    expect(resolvePendingPaymentTimeout(null)).toBe(24 * 60);
  });

  it("reads configured windows and rejects garbage", () => {
    expect(resolveVendorAcceptTimeout({ vendor_accept_timeout_minutes: 15 })).toBe(15);
    expect(resolveVendorAcceptTimeout({ vendor_accept_timeout_minutes: -5 })).toBe(30);
    expect(resolvePendingPaymentTimeout({ pending_payment_timeout_minutes: 120 })).toBe(120);
    expect(resolvePendingPaymentTimeout({ pending_payment_timeout_minutes: 0 })).toBe(24 * 60);
  });
});

describe("refundPaystackTransaction", () => {
  it("posts the transaction reference and returns the refund status", async () => {
    const fetchImpl = mockFetch({ status: true, data: { status: "pending", reference: "RF-1" } });
    const result = await refundPaystackTransaction({ reference: "SV-ABC" }, fetchImpl as never);
    expect(result.status).toBe("pending");
    expect(result.refundReference).toBe("RF-1");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).toContain("SV-ABC");
  });

  it("supports partial amounts and rejects bad ones", async () => {
    const fetchImpl = mockFetch({ status: true, data: { status: "success" } });
    await refundPaystackTransaction({ reference: "SV-ABC", amountKobo: 15000 }, fetchImpl as never);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).toContain("15000");
    await expect(refundPaystackTransaction({ reference: "SV-ABC", amountKobo: -3 })).rejects.toThrow();
  });

  it("throws when Paystack rejects the refund", async () => {
    const fetchImpl = mockFetch({ status: false, message: "Transaction already refunded" }, 400);
    await expect(refundPaystackTransaction({ reference: "SV-OLD" }, fetchImpl as never)).rejects.toThrow(
      /already refunded/,
    );
  });
});
