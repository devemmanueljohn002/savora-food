import { describe, expect, it } from "vitest";

import { verifyPassword } from "@/server/auth/password";
import {
  decideGoogleLink,
  googlePasswordPlaceholder,
  roleHome,
  sanitizeNext,
} from "@/server/auth/google";
import type { UserRow } from "@/server/auth/store";

function user(partial: Partial<UserRow> & { id: string }): UserRow {
  return {
    email: "a@b.c",
    phone: null,
    password_hash: "scrypt$16384$8$1$c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    first_name: "A",
    last_name: "B",
    role: "CUSTOMER",
    status: "ACTIVE",
    google_sub: null,
    email_verified_at: null,
    last_login_at: null,
    created_at: new Date(),
    ...partial,
  };
}

describe("sanitizeNext", () => {
  it("allows same-origin paths only", () => {
    expect(sanitizeNext("/rider/dashboard")).toBe("/rider/dashboard");
    expect(sanitizeNext("https://evil.example")).toBeNull();
    expect(sanitizeNext("//evil.example")).toBeNull();
    expect(sanitizeNext("")).toBeNull();
    expect(sanitizeNext(null)).toBeNull();
  });
});

describe("roleHome", () => {
  it("matches the proxy role homes", () => {
    expect(roleHome("CUSTOMER")).toBe("/");
    expect(roleHome("VENDOR")).toBe("/vendor/dashboard");
    expect(roleHome("DELIVERY_PARTNER")).toBe("/rider/dashboard");
    expect(roleHome("ADMIN")).toBe("/admin/dashboard");
    expect(roleHome("SUPER_ADMIN")).toBe("/super-admin/dashboard");
    expect(roleHome("BOGUS")).toBe("/");
  });
});

describe("decideGoogleLink", () => {
  const linked = user({ id: "u1", google_sub: "g123" });
  const plain = user({ id: "u2", google_sub: null });

  it("signs into the sub-linked account first", () => {
    const decision = decideGoogleLink(linked, plain, true);
    expect(decision).toEqual({ action: "login", user: linked });
  });

  it("links a verified-email match, never an unverified one", () => {
    expect(decideGoogleLink(undefined, plain, true)).toEqual({ action: "link", user: plain });
    expect(decideGoogleLink(undefined, plain, false)).toEqual({ action: "reject", reason: "unverified" });
  });

  it("creates only when nothing matches and the email is verified", () => {
    expect(decideGoogleLink(undefined, undefined, true)).toEqual({ action: "create" });
    expect(decideGoogleLink(undefined, undefined, false)).toEqual({
      action: "reject",
      reason: "unverified",
    });
  });
});

describe("googlePasswordPlaceholder", () => {
  it("can never authenticate a password login", async () => {
    const marker = googlePasswordPlaceholder();
    expect(marker.startsWith("google-oauth$")).toBe(true);
    expect(await verifyPassword("anything-at-all", marker)).toBe(false);
    expect(await verifyPassword("", marker)).toBe(false);
  });
});
