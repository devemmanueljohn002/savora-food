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

describe("order transitions (single gate)", () => {
  it("allows the documented lifecycle path", async () => {
    const { canTransitionOrder, assertOrderTransition } = await import("@/server/order-transitions");
    const path: [string, string][] = [
      ["PENDING_PAYMENT", "CANCELLED"],
      ["PAID", "VENDOR_ACCEPTED"],
      ["VENDOR_ACCEPTED", "PREPARING"],
      ["PREPARING", "READY_FOR_PICKUP"],
      ["PREPARING", "RIDER_ASSIGNED"],
      ["READY_FOR_PICKUP", "RIDER_ASSIGNED"],
      ["RIDER_ASSIGNED", "OUT_FOR_DELIVERY"],
      ["RIDER_ASSIGNED", "READY_FOR_PICKUP"],
      ["OUT_FOR_DELIVERY", "DELIVERED"],
      ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP"],
      ["PAID", "CANCELLED"],
      ["RIDER_ASSIGNED", "CANCELLED"],
      ["OUT_FOR_DELIVERY", "CANCELLED"],
    ];
    for (const [from, to] of path) {
      expect(canTransitionOrder(from, to)).toBe(true);
      expect(() => assertOrderTransition(from, to)).not.toThrow();
    }
  });

  it("rejects skips, backward jumps, and terminal exits", async () => {
    const { canTransitionOrder, assertOrderTransition } = await import("@/server/order-transitions");
    for (const [from, to] of [
      ["PAID", "DELIVERED"],
      ["PENDING_PAYMENT", "PAID"],
      ["RIDER_ASSIGNED", "DELIVERED"],
      ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"],
      ["DELIVERED", "CANCELLED"],
      ["CANCELLED", "READY_FOR_PICKUP"],
      ["BOGUS", "PAID"],
    ] as [string, string][]) {
      expect(canTransitionOrder(from, to)).toBe(false);
      expect(() => assertOrderTransition(from, to)).toThrow(/cannot move from/);
    }
  });
});

describe("hashed delivery codes", () => {
  it("verifies hashed codes and falls back to legacy plaintext", async () => {
    const { verifyDeliveryCode, hashDeliveryCode } = await import("@/server/orders");
    const hash = hashDeliveryCode("4821");
    expect(verifyDeliveryCode("4821", hash, null)).toBe(true);
    expect(verifyDeliveryCode("4822", hash, null)).toBe(false);
    expect(verifyDeliveryCode("4821", "not-a-hash...........", null)).toBe(false);
    expect(verifyDeliveryCode("4821", null, "4821")).toBe(true);
    expect(verifyDeliveryCode("4822", null, "4821")).toBe(false);
    expect(verifyDeliveryCode("", hash, null)).toBe(false);
    expect(verifyDeliveryCode(null, hash, null)).toBe(false);
  });
});

describe("unclaimed refund window", () => {
  it("defaults to 6 hours and reads configured values", async () => {
    const { resolveUnclaimedRefundHours, UNCLAIMED_REFUND_HOURS } = await import("@/server/orders");
    expect(UNCLAIMED_REFUND_HOURS).toBe(6);
    expect(resolveUnclaimedRefundHours(null)).toBe(6);
    expect(resolveUnclaimedRefundHours({ unclaimed_refund_hours: 2 })).toBe(2);
    expect(resolveUnclaimedRefundHours({ unclaimed_refund_hours: 0 })).toBe(6);
  });
});
