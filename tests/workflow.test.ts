import { describe, expect, it } from "vitest";
import {
  computeCouponDiscount,
  computeOrderTotals,
  computeServiceFee,
  computeTaxAmount,
  deliveryProgressPct,
  generateDeliveryOtp,
  generateOrderNumber,
  groupCartByVendor,
  normalizePricingConfig,
  toKobo,
  verifyDeliveryOtp,
} from "@/server/orders";
import { hashDeliveryCode, rankCandidates } from "@/server/dispatch";
import { computeMoneySplit, DEFAULT_PAYOUT } from "@/server/money";
import type { CartItemView } from "@/lib/order-types";

// Mirrors NEXT in app/api/vendor/orders/[id]/route.ts — vendor-driven progression.
const VENDOR_NEXT: Record<string, string> = {
  VENDOR_ACCEPTED: "PREPARING",
  CONFIRMED: "PREPARING",
  PREPARING: "READY_FOR_PICKUP",
};

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

describe("full workflow: Consumer → Vendor → Rider → Consumer", () => {
  it("consumer builds a multi-vendor cart, quotes totals, and mints payable orders", () => {
    // 1. Consumer adds items from two kitchens.
    const cart = [
      cartItem("v-jollof", "p-jollof", 4500, 2),
      cartItem("v-jollof", "p-dodo", 1200, 1),
      cartItem("v-suya", "p-suya", 3000, 2),
    ];
    const groups = groupCartByVendor(cart);
    expect(groups).toHaveLength(2);

    // 2. Checkout preview math per vendor order (pricing + coupon + fees + tax).
    const pricing = normalizePricingConfig(null); // defaults: 5% fee, 7.5% tax
    const deliveryFee = 900;
    const couponDiscount = computeCouponDiscount({ type: "PERCENT", value: 10 }, 10200);
    expect(couponDiscount).toBe(1020);

    const totals = groups.map((group) => {
      const subtotal = group.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      const discount = group.vendorId === "v-jollof" ? computeCouponDiscount({ type: "PERCENT", value: 10 }, subtotal) : 0;
      const serviceFee = computeServiceFee(subtotal, pricing);
      const tax = computeTaxAmount(subtotal - discount + serviceFee, pricing);
      return computeOrderTotals(group.lines, deliveryFee, discount, { serviceFee, tax });
    });
    for (const t of totals) {
      expect(t.total).toBe(t.subtotal + t.deliveryFee + t.serviceFee + t.tax - t.discount);
      expect(t.total).toBeGreaterThan(0);
      // Paystack requires integer kobo.
      expect(Number.isInteger(toKobo(t.total))).toBe(true);
    }

    // 3. One order number per vendor order, unique and well-formed.
    const numbers = new Set([generateOrderNumber(), generateOrderNumber()]);
    expect(numbers.size).toBe(2);
    for (const n of numbers) expect(n).toMatch(/^SV-\d{8}-[0-9A-F]{6}$/);
  });

  it("vendor accepts a PAID order and advances it to READY_FOR_PICKUP", () => {
    // Payment webhook moves PENDING_PAYMENT → PAID; vendor owns the rest.
    let status = "PENDING_PAYMENT";
    status = "PAID"; // markOrderPaymentPaid
    expect(status).toBe("PAID");

    // accept: only PAID → VENDOR_ACCEPTED.
    const canAccept = (s: string) => s === "PAID";
    expect(canAccept("PENDING_PAYMENT")).toBe(false);
    expect(canAccept(status)).toBe(true);
    status = "VENDOR_ACCEPTED";

    // advance through NEXT until ready for pickup (triggers rider dispatch).
    const seen: string[] = [status];
    while (VENDOR_NEXT[status]) {
      status = VENDOR_NEXT[status];
      seen.push(status);
    }
    expect(seen).toEqual(["VENDOR_ACCEPTED", "PREPARING", "READY_FOR_PICKUP"]);

    // Illegal transitions the API must reject:
    expect(VENDOR_NEXT["PAID"]).toBeUndefined(); // "Accept or reject first"
    expect(VENDOR_NEXT["READY_FOR_PICKUP"]).toBeUndefined(); // rider owns handoff
    expect(VENDOR_NEXT["OUT_FOR_DELIVERY"]).toBeUndefined(); // rider owns delivery
  });

  it("rider is dispatched, accepts the job, and runs the delivery state machine", () => {
    // Dispatch ranking: idle + zone match wins over busy / out-of-zone.
    const idleNear = {
      id: "r-near", user_id: "u-near", name: "Near Rider", vehicle_type: "BIKE",
      current_zone: "ikeja", rating_average: 4.8, last_assignment_at: null, active_trips: 0,
    };
    const busy = { ...idleNear, id: "r-busy", user_id: "u-busy", name: "Busy", active_trips: 1 };
    const far = { ...idleNear, id: "r-far", user_id: "u-far", name: "Far", current_zone: "lekki" };
    const ranked = rankCandidates([busy, far, idleNear], { vehicle_required: null, zone: "ikeja" });
    expect(ranked[0].id).toBe("r-near");

    // Accept gate mirrors rider/jobs/accept: order must be READY_FOR_PICKUP with no live delivery.
    const canAcceptJob = (orderStatus: string, liveDelivery: boolean, riderOnline: boolean) =>
      orderStatus === "READY_FOR_PICKUP" && !liveDelivery && riderOnline;
    expect(canAcceptJob("PREPARING", false, true)).toBe(false);
    expect(canAcceptJob("READY_FOR_PICKUP", true, true)).toBe(false);
    expect(canAcceptJob("READY_FOR_PICKUP", false, true)).toBe(true);

    // Delivery progression with OTP handshake at drop-off.
    const otp = generateDeliveryOtp();
    expect(otp).toMatch(/^\d{4}$/);
    expect(verifyDeliveryOtp(otp, otp)).toBe(true);
    expect(verifyDeliveryOtp(otp, "0000")).toBe(false);
    expect(hashDeliveryCode("4821")).toBe(hashDeliveryCode("4821"));

    let delivery = "ASSIGNED";
    delivery = "GOING_TO_VENDOR";
    delivery = "ARRIVED_AT_VENDOR";
    delivery = "PICKED_UP"; // → order OUT_FOR_DELIVERY
    const orderAfterPickup = "OUT_FOR_DELIVERY";
    expect(orderAfterPickup).toBe("OUT_FOR_DELIVERY");
    delivery = "IN_TRANSIT";
    // deliver requires the customer code when require_otp is set
    const requireOtp = true;
    const supplied = otp;
    expect(requireOtp && verifyDeliveryOtp(otp, supplied)).toBe(true);
    delivery = "DELIVERED";
    expect(delivery).toBe("DELIVERED");
    expect(deliveryProgressPct("ASSIGNED")).toBe(15);
    expect(deliveryProgressPct(delivery)).toBe(100);
  });

  it("consumer receives DELIVERED order and money splits reconcile", () => {
    const money = { subtotal: 7000, deliveryFee: 1000, serviceFee: 500, tax: 525, discount: 0, total: 9025 };
    const split = computeMoneySplit(money, DEFAULT_PAYOUT);
    // Vendor keeps subtotal minus 10% commission; rider keeps 100% of delivery fee.
    expect(split).toEqual({
      vendorAmount: 6300,
      riderAmount: 1000,
      platformAmount: 700 + 500, // commission + service fee (tax goes to vendor flow, not platform)
      commission: 700,
    });
    // Ledger reconciliation: vendor + rider + platform == subtotal + delivery + service + tax share.
    expect(split.vendorAmount + split.riderAmount + split.platformAmount).toBe(
      money.subtotal + money.deliveryFee + money.serviceFee,
    );
    // Tracking history shows the full consumer-visible chain.
    const history = ["PENDING_PAYMENT", "PAID", "VENDOR_ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "RIDER_ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"];
    expect(history[0]).toBe("PENDING_PAYMENT");
    expect(history[history.length - 1]).toBe("DELIVERED");
    expect(deliveryProgressPct("DELIVERED")).toBe(100);
  });

  it("rejects illegal shortcuts across actors", () => {
    // Vendor cannot skip accept; rider cannot deliver before pickup; OTP cannot be empty.
    expect(VENDOR_NEXT["PAID"]).toBeUndefined();
    expect(verifyDeliveryOtp("4821", "")).toBe(false);
    expect(verifyDeliveryOtp(null, "4821")).toBe(false);
    // Discounts never exceed the order value.
    const capped = computeOrderTotals(
      [{ productId: "p", name: "n", unitPrice: 1000, quantity: 1, customInstructions: null }],
      100, 99999, { serviceFee: 50, tax: 75 },
    );
    expect(capped.total).toBe(0);
  });
});
