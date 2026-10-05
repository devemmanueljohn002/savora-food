import { describe, expect, it } from "vitest";

import { OTP_MINUTES, RESET_MINUTES } from "@/server/email";
import { buildOtpEmail, buildResetEmail, buildVerifyEmail } from "@/server/email/auth-emails";
import { formatAddress, formatNaira } from "@/server/email/layout";
import { buildPaymentConfirmedEmail, buildVendorNewOrderEmail } from "@/server/email/order-emails";

const APP_URL = "https://savora-food.vercel.app";
const LINK = `${APP_URL}/reset-password?token=abc123`;
const VERIFY_LINK = `${APP_URL}/verify-email?token=abc123`;
const LOGO = `${APP_URL}/savora-logo-wide.png`;

describe("reset email template wiring", () => {
  it("uses the shared 30-minute constant for the email wording", () => {
    expect(RESET_MINUTES).toBe(30);
    const email = buildResetEmail(LINK, RESET_MINUTES, APP_URL);
    expect(email.subject).toBe("Reset your Savora Food password");
    expect(email.textContent).toContain("expires in 30 minutes");
    expect(email.textContent).toContain(LINK);
    expect(email.htmlContent).toContain("expires in 30 minutes");
  });

  it("embeds a single-slash link in the orange button", () => {
    const email = buildResetEmail(LINK, RESET_MINUTES, APP_URL);
    // The href must not contain a doubled slash (APP_URL trailing-slash bug).
    expect(email.htmlContent).not.toContain("//reset-password");
    expect(email.htmlContent).toContain(`href="${LINK}"`);
    // Savora orange button from app/globals.css.
    expect(email.htmlContent).toContain("#FF6500");
    expect(email.htmlContent).toContain("Reset password");
  });

  it("shows the logo at 160px with alt text on a light badge", () => {
    const email = buildResetEmail(LINK, RESET_MINUTES, APP_URL);
    expect(email.htmlContent).toContain(`<img src="${LOGO}"`);
    expect(email.htmlContent).toContain('alt="Savora Food"');
    expect(email.htmlContent).toContain('width="160"');
    expect(email.htmlContent).toContain('bgcolor="#FFFFFF"');
  });

  it("keeps the OTP template at its 10-minute default", () => {
    expect(OTP_MINUTES).toBe(10);
    const email = buildOtpEmail("123456", OTP_MINUTES, APP_URL);
    expect(email.subject).toContain("123456");
    expect(email.textContent).toContain("expires in 10 minutes");
    expect(email.htmlContent).toContain("123456");
    expect(email.htmlContent).toContain(`<img src="${LOGO}"`);
  });

  it("builds the verify email on the shared layout", () => {
    const email = buildVerifyEmail(VERIFY_LINK, APP_URL);
    expect(email.subject).toBe("Verify your Savora Food email");
    expect(email.textContent).toContain(VERIFY_LINK);
    expect(email.htmlContent).toContain(`href="${VERIFY_LINK}"`);
    expect(email.htmlContent).toContain(`<img src="${LOGO}"`);
  });
});

describe("shared email helpers", () => {
  it("formats naira as ₦15,000 without decimals", () => {
    expect(formatNaira(15000)).toBe("₦15,000");
    expect(formatNaira(13880.63)).toContain("₦13,880.63");
  });

  it("de-duplicates city/state instead of printing Lagos three times", () => {
    expect(
      formatAddress({ fullAddress: "14 Admiralty Way, Lekki Phase 1, Lagos", city: "Lagos", state: "Lagos" }),
    ).toBe("14 Admiralty Way, Lekki Phase 1, Lagos");
    expect(formatAddress({ fullAddress: "Lagos", city: "Lagos", state: "Lagos" })).toBe("Lagos");
    expect(formatAddress(null)).toBe("No delivery address on file.");
  });

  it("escapes user-supplied text in the vendor email", () => {
    const email = buildVendorNewOrderEmail({
      orderNumber: "SV-20261005-E03F66",
      orderId: "order-id",
      customerName: "Emma Adeyemi",
      items: [{ name: "<b>Chapman</b> & chilled", quantity: 2, lineTotal: 3000 }],
      foodSubtotal: 3000,
      address: { fullAddress: "<script>alert(1)</script>", city: "Lagos", state: "Lagos" },
      appUrl: APP_URL,
    });
    expect(email.subject).toBe("New order SV-20261005-E03F66 from Emma");
    expect(email.htmlContent).not.toContain("<script>");
    expect(email.htmlContent).not.toContain("<b>Chapman</b>");
    expect(email.htmlContent).toContain("&lt;b&gt;Chapman&lt;/b&gt;");
    // Both CTAs point at the vendor dashboard order page (login required).
    expect(email.htmlContent).toContain(`${APP_URL}/vendor/orders/order-id`);
    expect(email.htmlContent).toContain("Accept order");
    expect(email.htmlContent).toContain("Reject order");
    // Plain-text twin ships alongside the HTML.
    expect(email.textContent).toContain("SV-20261005-E03F66");
    expect(email.textContent).toContain("₦3,000");
  });

  it("builds the payment confirmation with money + order link", () => {
    const email = buildPaymentConfirmedEmail({
      orderNumber: "SV-20261005-E03F66",
      orderId: "order-id",
      total: 15000,
      appUrl: APP_URL,
    });
    expect(email.subject).toBe("Payment confirmed for SV-20261005-E03F66");
    expect(email.htmlContent).toContain("₦15,000");
    expect(email.textContent).toContain("₦15,000");
    expect(email.htmlContent).toContain(`${APP_URL}/account/orders`);
  });
});
