import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

function routeSource(): string {
  return readFileSync(join(__dirname, "..", "app", "api", "rider", "deliveries", "[id]", "route.ts"), "utf8");
}

describe("deliver handler reads what it verifies (regression: SV-20261004-309D38)", () => {
  it("SELECTs the hash column the verifier consumes", () => {
    const source = routeSource();
    // The handler calls verifyDeliveryCode(supplied, delivery.delivery_code_hash, ...).
    // If the SELECT omits o.delivery_code_hash, the hash is `undefined` at runtime
    // (the TS type still claims string|null, so tsc stays green) and EVERY
    // hashed code falls through to the legacy NULL-plaintext path → always false.
    expect(source).toMatch(/o\.delivery_code_hash/);
  });

  it("never selects the plaintext code for the rider verify path", () => {
    // Defense in depth: even the legacy column must not feed rider responses.
    // (Legacy rows verify via DB-held plaintext; the value must never be serialized.)
    const source = routeSource();
    const getBlock = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function PATCH"));
    expect(getBlock).not.toMatch(/delivery_otp/);
  });
});

describe("OTP input normalization", () => {
  it("accepts leading-zero codes and padded input", async () => {
    const { verifyDeliveryCode, hashDeliveryCode } = await import("@/server/orders");
    const hash = hashDeliveryCode("0042");
    expect(verifyDeliveryCode("0042", hash, null)).toBe(true);
    expect(verifyDeliveryCode("  0042  ", hash, null)).toBe(true);
    expect(verifyDeliveryCode("0043", hash, null)).toBe(false);
  });

  it("rejects wrong codes without leaking which half failed", async () => {
    const { verifyDeliveryCode, hashDeliveryCode } = await import("@/server/orders");
    const hash = hashDeliveryCode("2209");
    expect(verifyDeliveryCode("2210", hash, null)).toBe(false);
    expect(verifyDeliveryCode("", hash, null)).toBe(false);
    expect(verifyDeliveryCode(null, hash, null)).toBe(false);
  });
});

describe("board pre-claim privacy", () => {
  it("toBoardJob exposes no customer identity or addresses", async () => {
    const { toBoardJob } = await import("@/server/dispatch");
    const job = toBoardJob(
      {
        id: "o1",
        order_number: "SV-20261004-XXXXXX",
        delivery_fee: "900",
        payout_bonus: "0",
        item_count: "2",
        created_at: new Date("2026-10-05T00:00:00.000Z"),
        vendor_name: "Test Kitchen",
        vendor_slug: "test-kitchen",
        vendor_city: "Lagos",
        vendor_zone: "Lekki",
        drop_city: "Lagos",
        drop_zone: "Ajah",
      } as never,
      100,
    );
    const serialized = JSON.stringify(job);
    expect(serialized).not.toMatch(/080|\+234|fullAddress|phone|customer|recipient/i);
    expect(job.payout).toBe(900);
    expect(job.vendor.name).toBe("Test Kitchen");
  });
});
