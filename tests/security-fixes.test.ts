import { describe, expect, it } from "vitest";

import { toJsonLdScript } from "@/lib/safe-json";
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
