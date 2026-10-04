import { describe, expect, it } from "vitest";

import { DELIVERY_CODE_MAX_ATTEMPTS, generateDeliveryOtp, verifyDeliveryOtp } from "@/server/orders";
import { buildOrderDeliveredEmail, formatDeliveredAt, formatNaira } from "@/server/email/order-delivered";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/server/email/unsubscribe";

const APP = "https://savora-food.vercel.app";

function sampleInput() {
  return {
    orderNumber: "SV-20261004-A1B2C3",
    vendorName: "Mama Tolu's Kitchen",
    customerName: "Adaeze Okafor",
    items: [
      { name: "Smoky Party Jollof Rice", quantity: 2, lineTotal: 5000 },
      { name: "Grilled Turkey", quantity: 1, lineTotal: 3500 },
    ],
    subtotal: 8500,
    deliveryFee: 900,
    serviceFee: 425,
    tax: 736.88,
    discount: 0,
    total: 10561.88,
    deliveredAt: "2026-10-04T11:30:00.000Z",
    address: { fullAddress: "14 Admiralty Way, Lekki Phase 1", city: "Lagos", state: "Lagos" },
    appUrl: APP,
    logoUrl: `${APP}/savora-logo-wide.png`,
    rateUrl: `${APP}/dashboard?tab=orders`,
    trackUrl: `${APP}/track`,
    supportUrl: `${APP}/contact`,
    termsUrl: `${APP}/terms`,
    privacyUrl: `${APP}/privacy`,
    unsubscribeUrl: `${APP}/unsubscribe?token=abc`,
  };
}

describe("order delivered email", () => {
  it("uses real site tokens, not guessed colors", () => {
    const { htmlContent } = buildOrderDeliveredEmail(sampleInput());
    for (const token of ["#FF6500", "#F7B733", "#302B27", "#716B65", "#E6DDD3", "#FAF8F4", "#FFFDF9", "#C95A12", "#1E8E3E"]) {
      expect(htmlContent).toContain(token);
    }
    expect(htmlContent).not.toContain("#F26B00");
  });

  it("is table-based, 600px max, with dark-mode-safe logo block", () => {
    const { htmlContent } = buildOrderDeliveredEmail(sampleInput());
    expect(htmlContent).toContain("<table");
    expect(htmlContent).toContain("max-width:600px");
    expect(htmlContent).toContain('name="color-scheme" content="light"');
    expect(htmlContent).toContain(`<img src="${APP}/savora-logo-wide.png"`);
    expect(htmlContent).toContain('alt="Savora Food"');
  });

  it("covers order content: headline, number, vendor, items, totals, time, address", () => {
    const email = buildOrderDeliveredEmail(sampleInput());
    expect(email.subject).toContain("SV-20261004-A1B2C3");
    expect(email.htmlContent).toContain("Your order has been delivered");
    expect(email.htmlContent).toContain("SV-20261004-A1B2C3");
    expect(email.htmlContent).toContain("Mama Tolu&#39;s Kitchen");
    expect(email.htmlContent).toContain("Smoky Party Jollof Rice");
    expect(email.htmlContent).toContain("× 2");
    expect(email.htmlContent).toContain(formatNaira(10561.88));
    expect(email.htmlContent).toContain("14 Admiralty Way, Lekki Phase 1");
    expect(email.htmlContent).toContain(formatDeliveredAt("2026-10-04T11:30:00.000Z"));
    expect(email.textContent).toContain("SV-20261004-A1B2C3");
    expect(email.textContent).toContain("Total paid:");
  });

  it("links CTAs and footer from APP_URL without doubled slashes", () => {
    const { htmlContent, textContent } = buildOrderDeliveredEmail(sampleInput());
    for (const href of [
      `${APP}/dashboard?tab=orders`,
      `${APP}/track`,
      `${APP}/contact`,
      `${APP}/terms`,
      `${APP}/privacy`,
      `${APP}/unsubscribe?token=abc`,
    ]) {
      expect(htmlContent).toContain(`href="${href}"`);
    }
    expect(htmlContent).toContain("Rate your experience");
    expect(htmlContent).toContain("Track / view order");
    expect(htmlContent).not.toContain("//dashboard");
    expect(htmlContent).not.toContain("//track");
    expect(textContent).toContain(`${APP}/dashboard?tab=orders`);
  });

  it("escapes hostile vendor/item names", () => {
    const input = sampleInput();
    input.vendorName = `<script>alert("x")</script>`;
    input.items = [{ name: `Jollof <b>& "Special"`, quantity: 1, lineTotal: 100 }];
    const { htmlContent } = buildOrderDeliveredEmail(input);
    expect(htmlContent).not.toContain("<script>");
    expect(htmlContent).toContain("&lt;script&gt;");
    expect(htmlContent).toContain("Jollof &lt;b&gt;&amp; &quot;Special&quot;");
  });
});

describe("delivery handoff rules", () => {
  it("locks the code after 5 wrong attempts", () => {
    expect(DELIVERY_CODE_MAX_ATTEMPTS).toBe(5);
  });

  it("generates 4-digit numeric codes and verifies timing-safe", () => {
    for (let i = 0; i < 25; i += 1) {
      const code = generateDeliveryOtp();
      expect(code).toMatch(/^[0-9]{4}$/);
    }
    expect(verifyDeliveryOtp("2230", "2230")).toBe(true);
    expect(verifyDeliveryOtp("2230", " 2230 ")).toBe(true);
    expect(verifyDeliveryOtp("2230", "2231")).toBe(false);
    expect(verifyDeliveryOtp(null, "2230")).toBe(false);
    expect(verifyDeliveryOtp("2230", null)).toBe(false);
  });
});

describe("unsubscribe tokens", () => {
  const secret = "test-secret";
  const uid = "11111111-2222-3333-4444-555555555555";

  it("round-trips a user id", () => {
    const token = signUnsubscribeToken(uid, secret);
    expect(verifyUnsubscribeToken(token, secret)).toBe(uid);
  });

  it("rejects tampered, foreign-secret and expired tokens", () => {
    const token = signUnsubscribeToken(uid, secret);
    expect(verifyUnsubscribeToken(`${token}tampered`, secret)).toBeNull();
    expect(verifyUnsubscribeToken(token, "other-secret")).toBeNull();
    expect(verifyUnsubscribeToken("not.a.valid.token.parts", secret)).toBeNull();
    expect(verifyUnsubscribeToken(null, secret)).toBeNull();
    const old = signUnsubscribeToken(uid, secret, 1000);
    expect(verifyUnsubscribeToken(old, secret, 1000 + 366 * 24 * 3600)).toBeNull();
  });
});
