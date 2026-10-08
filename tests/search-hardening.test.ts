import { describe, expect, it } from "vitest";

import { clampQuery } from "@/lib/catalog-params";
import { dashboardForRole } from "@/lib/savora-api";
import { getDashboardRouteForRole } from "@/lib/role-routes";
import { roleHome } from "@/server/auth/google";
import { buildRiderStatusEmail } from "@/server/email/rider-emails";
import { checkRateLimit, searchRateLimitKey } from "@/server/rate-limit";

describe("post-login routing (single source of truth)", () => {
  it("sends customers to their dashboard from every entry point", () => {
    expect(getDashboardRouteForRole("CUSTOMER")).toBe("/dashboard");
    expect(dashboardForRole("CUSTOMER")).toBe("/dashboard");
    expect(dashboardForRole(undefined)).toBe("/dashboard");
  });

  it("keeps roleHome aligned with the home map", () => {
    expect(roleHome("VENDOR")).toBe("/vendor/dashboard");
    expect(roleHome("DELIVERY_PARTNER")).toBe("/rider/dashboard");
    expect(roleHome("BOGUS")).toBe("/");
  });
});

describe("search input clamping", () => {
  it("caps unbounded SSR inputs", () => {
    expect(clampQuery("  hello  ")).toBe("hello");
    expect(clampQuery("")).toBeUndefined();
    expect(clampQuery(undefined)).toBeUndefined();
    expect(clampQuery("x".repeat(500))?.length).toBe(120);
  });
});

describe("search rate limit", () => {
  it("allows bursts then 429s", () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    for (let i = 0; i < 60; i++) {
      expect(checkRateLimit(key, 60, 60_000).ok).toBe(true);
    }
    const blocked = checkRateLimit(key, 60, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("derives a stable key per request", () => {
    const req = new Request("https://x.test/api/search?q=jollof", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(searchRateLimitKey(req)).toBe("search:1.2.3.4");
  });
});

describe("rider status email (shared layout)", () => {
  it("renders HTML + text with escaped user input and absolute CTA", () => {
    const built = buildRiderStatusEmail({
      orderNumber: "SV-1",
      headline: "Rider <b>arrived</b>",
      body: "Ada <script>alert(1)</script> is here.",
      appUrl: "https://savora-food.vercel.app",
    });
    expect(built.subject).toContain("SV-1");
    expect(built.htmlContent).toContain("#FF6500");
    expect(built.htmlContent).not.toContain("<script>");
    expect(built.htmlContent).toContain("https://savora-food.vercel.app/track");
    expect(built.textContent).toContain("SV-1");
  });
});
