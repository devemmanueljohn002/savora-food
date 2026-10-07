import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-for-affiliates";
process.env.APP_URL ??= "http://localhost:3000";

import {
  computeCommissionKobo,
  DEFAULT_COMMISSION_CONFIG,
  isSelfReferral,
  normalizePhoneForCompare,
  normalizeReferralCode,
  resolveAttributionCode,
} from "@/server/affiliates";

describe("commission math", () => {
  it("defaults to 5% of item subtotal minus discounts (delivery fee excluded)", () => {
    // ₦6,000 order at 5% = ₦300.
    const { baseKobo, amountKobo } = computeCommissionKobo(
      { subtotalNaira: 6000, discountNaira: 0 },
      DEFAULT_COMMISSION_CONFIG,
    );
    expect(baseKobo).toBe(600_000);
    expect(amountKobo).toBe(30_000);
  });

  it("subtracts discounts from the base", () => {
    const { baseKobo, amountKobo } = computeCommissionKobo(
      { subtotalNaira: 6000, discountNaira: 1000 },
      DEFAULT_COMMISSION_CONFIG,
    );
    expect(baseKobo).toBe(500_000);
    expect(amountKobo).toBe(25_000);
  });

  it("supports a flat amount per order", () => {
    const { amountKobo } = computeCommissionKobo(
      { subtotalNaira: 6000, discountNaira: 0 },
      { ...DEFAULT_COMMISSION_CONFIG, mode: "FLAT", flatKobo: 50_000 },
    );
    expect(amountKobo).toBe(50_000);
  });

  it("floors at zero (discount bigger than subtotal)", () => {
    const { baseKobo, amountKobo } = computeCommissionKobo(
      { subtotalNaira: 500, discountNaira: 1000 },
      DEFAULT_COMMISSION_CONFIG,
    );
    expect(baseKobo).toBe(0);
    expect(amountKobo).toBe(0);
  });
});

describe("attribution precedence", () => {
  it("prefers a checkout code over the cookie", () => {
    expect(resolveAttributionCode("john123", "JANE999")).toBe("JOHN123");
  });

  it("falls back to the cookie when no code is typed", () => {
    expect(resolveAttributionCode(null, "jane999")).toBe("JANE999");
    expect(resolveAttributionCode("", null)).toBeNull();
  });

  it("rejects malformed codes", () => {
    expect(() => normalizeReferralCode("ab")).toThrow();
    expect(normalizeReferralCode(" john-123 ")).toBe("JOHN123");
  });
});

describe("self-referral anti-fraud", () => {  it("blocks by account id", () => {
    expect(
      isSelfReferral({ affiliateUserId: "u1", affiliatePhone: null, orderUserId: "u1", orderPhone: null }),
    ).toBe(true);
  });

  it("blocks by phone number across formats", () => {
    expect(normalizePhoneForCompare("+234 803 123 4567")).toBe("8031234567");
    expect(normalizePhoneForCompare("0803-123-4567")).toBe("8031234567");
    expect(
      isSelfReferral({
        affiliateUserId: "u1",
        affiliatePhone: "0803 123 4567",
        orderUserId: "u2",
        orderPhone: "+2348031234567",
      }),
    ).toBe(true);
  });

  it("allows genuine referrals", () => {
    expect(
      isSelfReferral({
        affiliateUserId: "u1",
        affiliatePhone: "0803 111 2222",
        orderUserId: "u2",
        orderPhone: "0803 333 4444",
      }),
    ).toBe(false);
  });
});

describe("dispute webhook reference", () => {
  it("finds the original transaction reference in dispute payloads", async () => {
    const { extractDisputeReference } = await import("../app/api/webhooks/paystack/route");
    expect(extractDisputeReference({ data: { transaction_reference: "SV-ABC" } })).toBe("SV-ABC");
    expect(extractDisputeReference({ data: { transaction: { reference: "SV-XYZ" } } })).toBe("SV-XYZ");
    expect(extractDisputeReference({ data: {} })).toBeNull();
  });
});
