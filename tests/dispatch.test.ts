import { describe, expect, it } from "vitest";
import {
  canTransitionDelivery,
  hashDeliveryCode,
} from "@/server/dispatch";
import { computeMoneySplit, normalizePayoutConfig } from "@/server/money";

describe("delivery code", () => {
  it("hashes deterministically", () => {
    expect(hashDeliveryCode("4821")).toBe(hashDeliveryCode("4821"));
    expect(hashDeliveryCode("4821")).not.toBe(hashDeliveryCode("4822"));
  });
});

describe("delivery transitions (single authority)", () => {
  it("follows the assignment lifecycle in order", () => {
    expect(canTransitionDelivery("OFFERED", "ASSIGNED")).toBe(true);
    expect(canTransitionDelivery("ASSIGNED", "PICKED_UP")).toBe(true);
    expect(canTransitionDelivery("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canTransitionDelivery("IN_TRANSIT", "DELIVERED")).toBe(true);
  });

  it("allows failure/cancellation from any live state, never from terminal ones", () => {
    for (const from of ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"]) {
      expect(canTransitionDelivery(from, "FAILED")).toBe(true);
      expect(canTransitionDelivery(from, "CANCELLED")).toBe(true);
    }
    for (const from of ["DELIVERED", "FAILED", "CANCELLED"]) {
      expect(canTransitionDelivery(from, "ASSIGNED")).toBe(false);
      expect(canTransitionDelivery(from, "PICKED_UP")).toBe(false);
    }
    // No skipping ahead: assigned straight to delivered is forbidden.
    expect(canTransitionDelivery("ASSIGNED", "DELIVERED")).toBe(false);
  });
});

describe("computeMoneySplit", () => {
  it("splits vendor commission, rider fee and platform share", () => {
    const split = computeMoneySplit(
      { subtotal: 7000, deliveryFee: 1000, serviceFee: 500, tax: 0, discount: 0, total: 8500 },
      { vendorCommissionPct: 10, riderShareOfDeliveryFeePct: 100, platformKeepsServiceFee: true, platformKeepsTax: false },
    );
    expect(split).toEqual({ vendorAmount: 6300, riderAmount: 1000, platformAmount: 1200, commission: 700 });
  });

  it("falls back to defaults for malformed payout config", () => {
    expect(normalizePayoutConfig(null)).toEqual({
      vendorCommissionPct: 10,
      riderShareOfDeliveryFeePct: 100,
      platformKeepsServiceFee: true,
      platformKeepsTax: false,
    });
  });
});
