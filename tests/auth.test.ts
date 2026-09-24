import { describe, expect, it } from "vitest";
import { generateOpaqueToken, hashToken } from "@/server/auth/tokens";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("auth tokens", () => {
  it("generates unique opaque tokens of expected length", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(48);
  });

  it("hashes tokens deterministically", () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });
});

describe("password hashing", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("Demo_User_123!");
    expect(hash).not.toContain("Demo_User_123!");
    expect(await verifyPassword("Demo_User_123!", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces unique salts", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first).not.toBe(second);
    expect(await verifyPassword("same-password", second)).toBe(true);
  });
});