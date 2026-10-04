import { describe, expect, it } from "vitest";
import {
  canTransitionDelivery,
  canTransitionOffer,
  hashDeliveryCode,
  MAX_DISPATCH_ATTEMPTS,
  OFFER_TTL_SECONDS,
  rankCandidates,
  resolveDispatchConfig,
  type DispatchCandidate,
} from "@/server/dispatch";
import { computeMoneySplit, normalizePayoutConfig } from "@/server/money";

function rider(partial: Partial<DispatchCandidate> & { id: string }): DispatchCandidate {
  return {
    user_id: `u-${partial.id}`,
    name: `Rider ${partial.id}`,
    vehicle_type: "BIKE",
    current_zone: "ikeja",
    rating_average: 4.5,
    last_assignment_at: null,
    active_trips: 0,
    ...partial,
  };
}

describe("rankCandidates", () => {
  it("prefers idle riders, then zone match, then oldest assignment", () => {
    const busy = rider({ id: "busy", active_trips: 1, current_zone: "ikeja" });
    const far = rider({ id: "far", current_zone: "lekki", last_assignment_at: new Date("2026-01-01") });
    const near = rider({ id: "near", current_zone: "ikeja", last_assignment_at: new Date("2026-06-01") });
    const ranked = rankCandidates([busy, far, near], { vehicle_required: null, zone: "ikeja" });
    expect(ranked.map((r) => r.id)).toEqual([near.id, far.id, busy.id]);
  });

  it("prefers matching vehicle type when required", () => {
    const bike = rider({ id: "bike", vehicle_type: "BIKE" });
    const car = rider({ id: "car", vehicle_type: "CAR" });
    const ranked = rankCandidates([car, bike], { vehicle_required: "BIKE", zone: "ikeja" });
    expect(ranked[0].id).toBe(bike.id);
  });
});

describe("delivery code", () => {
  it("hashes deterministically", () => {
    expect(hashDeliveryCode("4821")).toBe(hashDeliveryCode("4821"));
    expect(hashDeliveryCode("4821")).not.toBe(hashDeliveryCode("4822"));
  });
});

describe("offer transitions (single authority)", () => {
  it("moves OFFERED only to ACCEPTED/DECLINED/EXPIRED/CANCELLED", () => {
    for (const next of ["ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]) {
      expect(canTransitionOffer("OFFERED", next)).toBe(true);
    }
    expect(canTransitionOffer("OFFERED", "OFFERED")).toBe(false);
    expect(canTransitionOffer("OFFERED", "DELIVERED")).toBe(false);
  });

  it("treats every terminal offer state as final", () => {
    for (const from of ["ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]) {
      for (const to of ["OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]) {
        expect(canTransitionOffer(from, to)).toBe(false);
      }
    }
    expect(canTransitionOffer("BOGUS", "ACCEPTED")).toBe(false);
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

describe("dispatch config (configurable TTL + max attempts)", () => {
  it("defaults to 90s offers and 5 attempts", () => {
    expect(OFFER_TTL_SECONDS).toBe(90);
    expect(MAX_DISPATCH_ATTEMPTS).toBe(5);
    expect(resolveDispatchConfig(null)).toEqual({ offerTtlSeconds: 90, maxAttempts: 5 });
    expect(resolveDispatchConfig({})).toEqual({ offerTtlSeconds: 90, maxAttempts: 5 });
  });

  it("reads configured values and rejects garbage", () => {
    expect(resolveDispatchConfig({ offer_ttl_seconds: 60, max_dispatch_attempts: 3 })).toEqual({
      offerTtlSeconds: 60,
      maxAttempts: 3,
    });
    expect(resolveDispatchConfig({ offer_ttl_seconds: 0, max_dispatch_attempts: -2 })).toEqual({
      offerTtlSeconds: 90,
      maxAttempts: 5,
    });
    expect(resolveDispatchConfig({ offer_ttl_seconds: "soon" })).toEqual({ offerTtlSeconds: 90, maxAttempts: 5 });
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
