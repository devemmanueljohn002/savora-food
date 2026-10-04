import { describe, expect, it } from "vitest";

import { OTP_MINUTES, RESET_MINUTES } from "@/server/email";
import { buildOtpEmail, buildResetEmail } from "@/server/email/templates.js";

const LINK = "https://savora-food.vercel.app/reset-password?token=abc123";

describe("reset email template wiring", () => {
  it("uses the shared 30-minute constant for the email wording", () => {
    expect(RESET_MINUTES).toBe(30);
    const email = buildResetEmail(LINK, RESET_MINUTES);
    expect(email.subject).toBe("Reset your Savora Food password");
    expect(email.textContent).toContain("expires in 30 minutes");
    expect(email.textContent).toContain(LINK);
    expect(email.htmlContent).toContain("expires in 30 minutes");
  });

  it("embeds a single-slash link in the saffron button", () => {
    const email = buildResetEmail(LINK, RESET_MINUTES);
    // The href must not contain a doubled slash (APP_URL trailing-slash bug).
    expect(email.htmlContent).not.toContain("//reset-password");
    expect(email.htmlContent).toContain(`href="${LINK}"`);
    // Saffron button present.
    expect(email.htmlContent).toContain("#F5B301");
  });

  it("keeps the OTP template at its 10-minute default", () => {
    expect(OTP_MINUTES).toBe(10);
    const email = buildOtpEmail("123456");
    expect(email.subject).toContain("123456");
    expect(email.textContent).toContain("expires in 10 minutes");
    expect(email.htmlContent).toContain("123456");
  });
});
