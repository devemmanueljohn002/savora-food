import { describe, expect, it } from "vitest";

import { buildVendorStatusEmail } from "@/server/email/vendor-status-emails";

const APP_URL = "https://savora-food.vercel.app";

describe("vendor moderation emails", () => {
  it("builds the approval email with a dashboard CTA", () => {
    const email = buildVendorStatusEmail("APPROVED", { businessName: "Mama Test Kitchen", appUrl: APP_URL });
    expect(email.subject).toContain("Mama Test Kitchen");
    expect(email.htmlContent).toContain(`${APP_URL}/vendor/dashboard`);
    expect(email.htmlContent).toContain("#FF6500");
    expect(email.textContent).toContain("approved");
  });

  it("includes the required reason in rejection and suspension emails", () => {
    const rejected = buildVendorStatusEmail("REJECTED", {
      businessName: "Mama Test Kitchen",
      reason: "Missing CAC certificate",
      appUrl: APP_URL,
    });
    expect(rejected.textContent).toContain("Missing CAC certificate");
    expect(rejected.htmlContent).toContain("Missing CAC certificate");

    const suspended = buildVendorStatusEmail("SUSPENDED", {
      businessName: "Mama Test Kitchen",
      reason: "Hygiene complaint under review",
      appUrl: APP_URL,
    });
    expect(suspended.textContent).toContain("Hygiene complaint under review");
  });

  it("escapes business names and reasons", () => {
    const email = buildVendorStatusEmail("REJECTED", {
      businessName: "<b>Bad</b> Kitchen",
      reason: "<script>alert(1)</script>",
      appUrl: APP_URL,
    });
    expect(email.htmlContent).not.toContain("<script>");
    expect(email.htmlContent).toContain("&lt;b&gt;Bad&lt;/b&gt; Kitchen");
  });

  it("builds reactivation and override notices", () => {
    const reactivated = buildVendorStatusEmail("REACTIVATED", {
      businessName: "Mama Test Kitchen",
      reason: "Appeal upheld",
      appUrl: APP_URL,
    });
    expect(reactivated.textContent).toContain("reactivated");

    const overridden = buildVendorStatusEmail("OVERRIDDEN", {
      businessName: "Mama Test Kitchen",
      reason: "Manually verified ID at the hub",
      appUrl: APP_URL,
    });
    expect(overridden.textContent).toContain("Manually verified ID at the hub");
    expect(overridden.htmlContent).toContain(`${APP_URL}/vendor/dashboard`);
  });
});
