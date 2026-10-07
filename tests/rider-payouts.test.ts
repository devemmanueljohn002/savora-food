import { describe, expect, it } from "vitest";

// Test-only env defaults (mirrors tests/withdrawals.test.ts).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-for-rider-payouts";
process.env.PAYSTACK_SECRET_KEY ??= "sk_test_rider_payouts_secret";

import { computeMoneySplit, DEFAULT_PAYOUT, type OrderMoney } from "@/server/money";
import { ApiError } from "@/server/errors";
import {
  assertOwner,
  BANK_CHANGE_COOLING_HOURS_FALLBACK,
  CANCELLED_PICKUP_FEE_PCT_FALLBACK,
  computeCancelledPickupFeeKobo,
  computeRiderFeeKobo,
  isCoolingActive,
  isWithdrawalBlockedByBalance,
  nextWithdrawalStatus,
  ownerMatches,
  requireDeliveryConfirmed,
  resolveCancelledPickupFeePct,
  resolveCoolingHours,
  resolveOwnerPolicy,
  resolveRiderSharePct,
  RIDER_POLICY_FALLBACK,
  validateWithdrawalAmount,
  WITHDRAWAL_LIMITS,
  type Owner,
} from "@/server/wallet";

const RIDER: Owner = { type: "RIDER", id: "rider-1" };
const VENDOR: Owner = { type: "VENDOR", id: "vendor-1" };

describe("rider fee formula is UNCHANGED (percentage of the delivery fee)", () => {
  it("stays a pure percentage: computeRiderFeeKobo matches computeMoneySplit exactly", () => {
    const money: OrderMoney = {
      subtotal: 5000,
      deliveryFee: 0,
      serviceFee: 100,
      tax: 50,
      discount: 0,
      total: 5250,
    };
    for (const fee of [0, 250, 800, 1500.5, 12345.67]) {
      for (const pct of [0, 50, 80, 100]) {
        const config = { ...DEFAULT_PAYOUT, riderShareOfDeliveryFeePct: pct };
        const split = computeMoneySplit({ ...money, deliveryFee: fee, total: money.total + fee }, config);
        expect(computeRiderFeeKobo(fee, pct)).toBe(Math.round(split.riderAmount * 100));
      }
    }
  });

  it("resolves the configured share (default 100%) and clamps garbage", () => {
    expect(resolveRiderSharePct({})).toBe(100);
    expect(resolveRiderSharePct({ rider_share_of_delivery_fee_pct: 80 })).toBe(80);
    expect(resolveRiderSharePct({ rider_share_of_delivery_fee_pct: 250 })).toBe(100);
    expect(resolveRiderSharePct({ rider_share_of_delivery_fee_pct: -5 })).toBe(0);
    expect(resolveRiderSharePct({ rider_share_of_delivery_fee_pct: "80" })).toBe(100);
  });
});

describe("credit only after confirmed delivery", () => {
  it("refuses to credit when the handover is not confirmed", () => {
    try {
      requireDeliveryConfirmed(false);
      expect.unreachable();
    } catch (error) {
      expect((error as ApiError).code).toBe("CONFLICT");
    }
    expect(() => requireDeliveryConfirmed(true)).not.toThrow();
  });
});

describe("cancellation rules (before pickup: nothing, after pickup: partial)", () => {
  it("credits a share of the fee after pickup, zero before it", () => {
    expect(computeCancelledPickupFeeKobo(30_000, 50)).toBe(15_000);
    expect(computeCancelledPickupFeeKobo(30_001, 50)).toBe(15_001);
    expect(computeCancelledPickupFeeKobo(0, 50)).toBe(0);
    expect(computeCancelledPickupFeeKobo(-5, 50)).toBe(0);
    expect(computeCancelledPickupFeeKobo(30_000, 0)).toBe(0);
    expect(computeCancelledPickupFeeKobo(30_000, 100)).toBe(30_000);
  });

  it("resolves the configured partial share, bounded to 0–100", () => {
    expect(resolveCancelledPickupFeePct({})).toBe(CANCELLED_PICKUP_FEE_PCT_FALLBACK);
    expect(resolveCancelledPickupFeePct({ cancelled_pickup_fee_pct: 25 })).toBe(25);
    expect(resolveCancelledPickupFeePct({ cancelled_pickup_fee_pct: 500 })).toBe(100);
  });
});

describe("per-owner-type policy (vendor vs rider limits resolved independently)", () => {
  it("reads rider keys for riders with their own fallbacks", () => {
    const policy = resolveOwnerPolicy("RIDER", {
      rider_hold_days: 0,
      rider_min_withdrawal_kobo: 50_000,
      rider_max_withdrawal_kobo: 10_000_000,
      rider_auto_approve_below_kobo: 2_000_000,
    });
    expect(policy).toEqual({
      holdDays: 0,
      minWithdrawalKobo: 50_000,
      maxWithdrawalKobo: 10_000_000,
      autoApproveBelowKobo: 2_000_000,
    });
    expect(resolveOwnerPolicy("RIDER", {})).toEqual(RIDER_POLICY_FALLBACK);
  });

  it("reads vendor keys for vendors and ignores rider keys", () => {
    const policy = resolveOwnerPolicy("VENDOR", {
      hold_days: 3,
      min_withdrawal_kobo: 250_000,
      rider_min_withdrawal_kobo: 1,
    });
    expect(policy.holdDays).toBe(3);
    expect(policy.minWithdrawalKobo).toBe(250_000);
    expect(resolveOwnerPolicy("VENDOR", {})).toEqual({ ...WITHDRAWAL_LIMITS });
  });

  it("enforces the rider minimum against a rider policy and the vendor minimum against a vendor policy", () => {
    const riderPolicy = resolveOwnerPolicy("RIDER", { rider_min_withdrawal_kobo: 50_000 });
    const vendorPolicy = resolveOwnerPolicy("VENDOR", {});
    expect(() => validateWithdrawalAmount(50_000, 1_000_000, riderPolicy)).not.toThrow();
    expect(() => validateWithdrawalAmount(50_000, 1_000_000, vendorPolicy)).toThrowError(ApiError);
  });
});

describe("penalties, negative balances, and the withdrawal gate", () => {
  it("blocks every withdrawal while the available balance is not positive", () => {
    expect(isWithdrawalBlockedByBalance(-500, 100_000)).toBe(true);
    expect(isWithdrawalBlockedByBalance(0, 100_000)).toBe(true);
    expect(isWithdrawalBlockedByBalance(50_000, 100_000)).toBe(true);
    expect(isWithdrawalBlockedByBalance(100_000, 100_000)).toBe(false);
  });

  it("validateWithdrawalAmount rejects when penalties drove the balance negative", () => {
    expect(() => validateWithdrawalAmount(1_000_000, -2_500)).toThrowError(ApiError);
    try {
      validateWithdrawalAmount(1_000_000, -2_500);
      expect.unreachable();
    } catch (error) {
      expect((error as ApiError).code).toBe("CONFLICT");
    }
  });
});

describe("bank-change cooling period", () => {
  it("blocks withdrawals for the configured window after an account change", () => {
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3_600_000);
    expect(isCoolingActive(oneHourAgo, 24)).toBe(true);
    expect(isCoolingActive(twoDaysAgo, 24)).toBe(false);
    // No account change on record = no cooling.
    expect(isCoolingActive(null, 24)).toBe(false);
    expect(resolveCoolingHours({})).toBe(BANK_CHANGE_COOLING_HOURS_FALLBACK);
    expect(resolveCoolingHours({ bank_change_cooling_hours: 48 })).toBe(48);
    // Cooling is never configured to zero: at least 1 hour.
    expect(resolveCoolingHours({ bank_change_cooling_hours: 0 })).toBe(1);
  });
});

describe("owner isolation (no cross-wallet access)", () => {
  it("matches only identical (type, id) pairs", () => {
    expect(ownerMatches({ owner_type: "RIDER", owner_id: "rider-1" }, RIDER)).toBe(true);
    // Same id, wrong type (a vendor id equal to a rider id) still fails.
    expect(ownerMatches({ owner_type: "VENDOR", owner_id: "rider-1" }, RIDER)).toBe(false);
    expect(ownerMatches({ owner_type: "RIDER", owner_id: "rider-2" }, RIDER)).toBe(false);
  });

  it("denies vendor reads of rider rows and rider reads of vendor rows", () => {
    expect(() => assertOwner({ owner_type: "RIDER", owner_id: "rider-1" }, VENDOR)).toThrowError(ApiError);
    expect(() => assertOwner({ owner_type: "VENDOR", owner_id: "vendor-1" }, RIDER)).toThrowError(ApiError);
    try {
      assertOwner({ owner_type: "RIDER", owner_id: "rider-1" }, VENDOR);
      expect.unreachable();
    } catch (error) {
      expect((error as ApiError).code).toBe("FORBIDDEN");
    }
    expect(() => assertOwner({ owner_type: "RIDER", owner_id: "rider-1" }, RIDER)).not.toThrow();
  });
});

describe("transfer webhooks are owner-agnostic (rider reversals restore rider funds)", () => {
  it("applies the same transitions regardless of owner type", () => {
    // A failed rider transfer reverses to the rider; a failed vendor transfer
    // reverses to the vendor — the reversal flag logic is identical, only the
    // owner row the caller locks differs.
    expect(nextWithdrawalStatus("PROCESSING", "transfer.failed")).toBe("FAILED");
    expect(nextWithdrawalStatus("PROCESSING", "transfer.reversed")).toBe("REVERSED");
    expect(nextWithdrawalStatus("PROCESSING", "transfer.success")).toBe("SUCCESS");
    expect(nextWithdrawalStatus("SUCCESS", "transfer.failed")).toBeNull();
  });
});
