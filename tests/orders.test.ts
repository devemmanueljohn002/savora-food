import { describe, expect, it } from "vitest";
import {
  computeCouponDiscount,
  computeOrderTotals,
  computeServiceFee,
  computeTaxAmount,
  generateOrderNumber,
  groupCartByVendor,
  normalizePricingConfig,
  roundMoney,
  toKobo,
  type OrderLine,
} from "@/server/orders";
import type { CartItemView } from "@/lib/order-types";

const line = (n: string, unitPrice: number, quantity = 1): OrderLine => ({
  productId: `p-${n}`,
  name: n,
  unitPrice,
  quantity,
  customInstructions: null,
});

describe("computeOrderTotals", () => {
  it("computes subtotal, delivery fee and total", () => {
    const lines = [line("a", 4500, 2), line("b", 1200, 3)];
    const totals = computeOrderTotals(lines, 900);
    expect(totals.subtotal).toBe(12600);
    expect(totals.deliveryFee).toBe(900);
    expect(totals.serviceFee).toBe(0);
    expect(totals.tax).toBe(0);
    expect(totals.discount).toBe(0);
    expect(totals.total).toBe(13500);
  });

  it("adds service fee and tax before discount", () => {
    const totals = computeOrderTotals([line("a", 10000)], 800, 1000, { serviceFee: 500, tax: 750 });
    expect(totals.serviceFee).toBe(500);
    expect(totals.tax).toBe(750);
    expect(totals.total).toBe(11050);
  });

  it("caps discount at subtotal + fees + tax", () => {
    const totals = computeOrderTotals([line("a", 10000)], 800, 1000, { serviceFee: 500, tax: 750 });
    expect(totals.discount).toBe(1000);
    expect(totals.total).toBe(11050);

    const capped = computeOrderTotals([line("a", 10000)], 800, 99999, { serviceFee: 500, tax: 750 });
    expect(capped.discount).toBe(12050);
    expect(capped.total).toBe(0);
  });

  it("never applies a negative or malformed fee", () => {
    const totals = computeOrderTotals([line("a", 1000)], -50);
    expect(totals.deliveryFee).toBe(0);
    expect(totals.total).toBe(1000);
  });

  it("rounds money to two decimal places", () => {
    const totals = computeOrderTotals([line("a", 1499.99, 3)], 800);
    expect(totals.subtotal).toBe(4499.97);
    expect(totals.total).toBe(5299.97);
  });
});

describe("groupCartByVendor", () => {
  function cartItem(vendorId: string, productId: string, price: number, quantity = 1): CartItemView {
    return {
      id: `item-${productId}`,
      quantity,
      customInstructions: null,
      unitPrice: price,
      lineTotal: price * quantity,
      product: { id: productId, name: `Product ${productId}`, slug: productId, image: null },
      vendor: { id: vendorId, businessName: `Vendor ${vendorId}`, slug: vendorId },
    };
  }

  it("groups items from different vendors separately", () => {
    const groups = groupCartByVendor([
      cartItem("v1", "p1", 100, 2),
      cartItem("v2", "p2", 200, 1),
      cartItem("v1", "p3", 300, 1),
    ]);
    expect(groups).toHaveLength(2);
    const v1 = groups.find((group) => group.vendorId === "v1");
    expect(v1?.lines).toHaveLength(2);
    expect(v1?.lines.map((l) => l.productId)).toEqual(["p1", "p3"]);
    const v2 = groups.find((group) => group.vendorId === "v2");
    expect(v2?.vendorName).toBe("Vendor v2");
    expect(v2?.lines).toHaveLength(1);
  });

  it("preserves item order within a vendor", () => {
    const groups = groupCartByVendor([cartItem("v1", "b", 1), cartItem("v1", "a", 2)]);
    expect(groups[0].lines.map((l) => l.productId)).toEqual(["b", "a"]);
  });

  it("returns an empty array for an empty cart", () => {
    expect(groupCartByVendor([])).toEqual([]);
  });
});

describe("money helpers", () => {
  it("converts naira to kobo (Paystack amounts are integers)", () => {
    expect(toKobo(3500)).toBe(350000);
    expect(toKobo(1250.55)).toBe(125055);
  });

  it("rounds money", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
  });
});

describe("generateOrderNumber", () => {
  it("produces the SV-YYYYMMDD-XXXXXX shape", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    for (let i = 0; i < 5; i += 1) {
      expect(generateOrderNumber(now)).toMatch(/^SV-20260921-[0-9A-F]{6}$/);
    }
  });

  it("is unique across consecutive calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const value = generateOrderNumber();
      expect(seen.has(value)).toBe(false);
      seen.add(value);
    }
  });
});

describe("computeCouponDiscount", () => {
  it("applies a percentage off the subtotal", () => {
    expect(computeCouponDiscount({ type: "PERCENT", value: 10 }, 10000)).toBe(1000);
    expect(computeCouponDiscount({ type: "PERCENT", value: 5 }, 999)).toBe(49.95);
  });

  it("caps percentage at 100%", () => {
    expect(computeCouponDiscount({ type: "PERCENT", value: 150 }, 2000)).toBe(2000);
  });

  it("applies a fixed amount capped at the subtotal", () => {
    expect(computeCouponDiscount({ type: "FIXED", value: 1500 }, 10000)).toBe(1500);
    expect(computeCouponDiscount({ type: "FIXED", value: 1500 }, 800)).toBe(800);
  });

  it("returns zero for non-positive subtotals or values", () => {
    expect(computeCouponDiscount({ type: "PERCENT", value: 10 }, 0)).toBe(0);
    expect(computeCouponDiscount({ type: "FIXED", value: 0 }, 5000)).toBe(0);
    expect(computeCouponDiscount({ type: "FIXED", value: -50 }, 5000)).toBe(0);
  });

  it("flows through computeOrderTotals", () => {
    const totals = computeOrderTotals([line("a", 10000)], 800, computeCouponDiscount({ type: "PERCENT", value: 10 }, 10000));
    expect(totals.discount).toBe(1000);
    expect(totals.total).toBe(9800);
  });
});

describe("pricing config", () => {
  it("computes a percent service fee", () => {
    expect(computeServiceFee(10000, { serviceFeeType: "PERCENT", serviceFeeValue: 5, taxRatePercent: 7.5 })).toBe(500);
    expect(computeServiceFee(999, { serviceFeeType: "PERCENT", serviceFeeValue: 5, taxRatePercent: 7.5 })).toBe(49.95);
  });

  it("computes a flat service fee and caps percent at 100", () => {
    expect(computeServiceFee(10000, { serviceFeeType: "FLAT", serviceFeeValue: 250, taxRatePercent: 0 })).toBe(250);
    expect(computeServiceFee(0, { serviceFeeType: "FLAT", serviceFeeValue: 250, taxRatePercent: 0 })).toBe(0);
    expect(computeServiceFee(1000, { serviceFeeType: "PERCENT", serviceFeeValue: 150, taxRatePercent: 0 })).toBe(1000);
  });

  it("computes tax on the discounted base", () => {
    expect(computeTaxAmount(10000, { serviceFeeType: "PERCENT", serviceFeeValue: 5, taxRatePercent: 7.5 })).toBe(750);
    expect(computeTaxAmount(0, { serviceFeeType: "PERCENT", serviceFeeValue: 5, taxRatePercent: 7.5 })).toBe(0);
  });

  it("falls back to defaults for malformed config", () => {
    expect(normalizePricingConfig(null)).toEqual({ serviceFeeType: "PERCENT", serviceFeeValue: 5, taxRatePercent: 7.5 });
    expect(normalizePricingConfig({ service_fee_type: "BOGUS", service_fee_value: -1, tax_rate_percent: 999 })).toEqual({
      serviceFeeType: "PERCENT",
      serviceFeeValue: 5,
      taxRatePercent: 100,
    });
    expect(
      normalizePricingConfig({ service_fee_type: "FLAT", service_fee_value: 300, tax_rate_percent: 0 }),
    ).toEqual({ serviceFeeType: "FLAT", serviceFeeValue: 300, taxRatePercent: 0 });
  });
});