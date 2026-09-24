import { describe, expect, it } from "vitest";
import { hashDeliveryCode, rankCandidates, type DispatchCandidate } from "@/server/dispatch";
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
