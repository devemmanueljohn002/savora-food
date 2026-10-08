import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-for-security-fixes";
process.env.APP_URL ??= "http://localhost:3000";

import { toJsonLdScript } from "@/lib/safe-json";
import { storedDocumentUrl, storedImageUrl } from "@/lib/safe-url";
import { hashDeliveryCodeSalted, newDeliveryCodeSalt } from "@/server/dispatch";
import { verifyDeliveryCode } from "@/server/orders";
import { sanitizeNext } from "@/server/auth/google";
import { assertSameOrigin } from "@/server/csrf";
import { hashWithdrawalOtp, verifyWithdrawalOtpHash } from "@/server/withdrawal-otp";
import { verifyOAuthState } from "@/server/auth/google";

describe("toJsonLdScript", () => {
  it("neutralizes script breakouts while staying valid JSON", () => {
    const payload = { name: '</script><script>alert("xss")</script>' };
    const serialized = toJsonLdScript(payload);
    expect(serialized).not.toContain("</script>");
    expect(JSON.parse(serialized)).toEqual(payload);
  });
});

describe("withdrawal OTP hashing", () => {
  it("round-trips fresh salted hashes and rejects wrong codes", () => {
    const stored = hashWithdrawalOtp("482916");
    expect(stored.startsWith("v1$")).toBe(true);
    expect(verifyWithdrawalOtpHash(stored, "482916")).toBe(true);
    expect(verifyWithdrawalOtpHash(stored, "482917")).toBe(false);
  });

  it("salts every code (identical codes hash differently)", () => {
    expect(hashWithdrawalOtp("482916")).not.toBe(hashWithdrawalOtp("482916"));
  });

  it("never accepts stored plaintext", () => {
    expect(verifyWithdrawalOtpHash("482916", "482916")).toBe(false);
  });
});

describe("verifyOAuthState", () => {
  it("accepts exact matches and rejects empties/mismatches", () => {
    expect(verifyOAuthState("abc123", "abc123")).toBe(true);
    expect(verifyOAuthState("abc123", "abc124")).toBe(false);
    expect(verifyOAuthState("", "abc123")).toBe(false);
    expect(verifyOAuthState("abc123", "")).toBe(false);
  });
});

describe("sanitizeNext", () => {
  it("allows same-origin paths and rejects authorities and backslashes", () => {
    expect(sanitizeNext("/dashboard?tab=orders")).toBe("/dashboard?tab=orders");
    expect(sanitizeNext("//evil.com")).toBeNull();
    expect(sanitizeNext("https://evil.com")).toBeNull();
    expect(sanitizeNext("/\\evil.com")).toBeNull();
    expect(sanitizeNext("/\nevil")).toBeNull();
    expect(sanitizeNext("///evil")).toBeNull();
  });
});

describe("salted delivery codes", () => {
  it("verify salted rows and reject wrong codes", () => {
    const salt = newDeliveryCodeSalt();
    const hash = hashDeliveryCodeSalted("4821", salt);
    expect(hash.startsWith("v1$")).toBe(true);
    expect(verifyDeliveryCode("4821", hash, null, salt)).toBe(true);
    expect(verifyDeliveryCode("4822", hash, null, salt)).toBe(false);
    // Wrong salt never verifies, even with the right code.
    expect(verifyDeliveryCode("4821", hash, null, newDeliveryCodeSalt())).toBe(false);
  });
});

describe("stored URL validation", () => {
  it("rejects javascript:/data:/non-https URLs", () => {
    expect(() => storedDocumentUrl().parse("javascript:alert(1)")).toThrow();
    expect(() => storedImageUrl().parse("data:image/png;base64,AAA")).toThrow();
    expect(() => storedImageUrl().parse("http://evil.com/x.jpg")).toThrow();
    expect(() => storedImageUrl().parse("https://evil.com/x.jpg")).toThrow();
  });

  it("accepts Cloudinary, own origins, and same-origin relative uploads", () => {
    expect(storedImageUrl().parse("https://res.cloudinary.com/d/x.jpg")).toBe(
      "https://res.cloudinary.com/d/x.jpg",
    );
    expect(storedImageUrl().parse("/uploads/2026/01/u.jpg")).toBe("/uploads/2026/01/u.jpg");
    expect(storedDocumentUrl().parse("https://files.example.com/doc.pdf")).toBe(
      "https://files.example.com/doc.pdf",
    );
    expect(storedImageUrl().parse(null)).toBeNull();
  });
});

describe("assertSameOrigin", () => {
  const req = (origin?: string) =>
    new Request("http://localhost:3000/api/vendor/withdrawals", {
      method: "POST",
      ...(origin ? { headers: { Origin: origin } } : {}),
    });

  it("passes same-origin and absent origins, rejects cross-origin", () => {
    expect(() => assertSameOrigin(req("http://localhost:3000"))).not.toThrow();
    expect(() => assertSameOrigin(req())).not.toThrow();
    expect(() => assertSameOrigin(req("https://evil.com"))).toThrow();
  });
});
