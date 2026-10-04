import { describe, expect, it } from "vitest";

import {
  BOARD_MAX_ACTIVE_JOBS,
  BOARD_RADIUS_KM,
  BOARD_UNCLAIMED_MINUTES,
  boardAreaAllowed,
  boardEligibility,
  boardPayout,
  claimConflictMessage,
  haversineKm,
  resolveBoardConfig,
} from "@/server/dispatch";

describe("board config", () => {
  it("defaults to 1 active job, 10 unclaimed minutes, 8km radius, no bonus", () => {
    expect(BOARD_MAX_ACTIVE_JOBS).toBe(1);
    expect(BOARD_UNCLAIMED_MINUTES).toBe(10);
    expect(BOARD_RADIUS_KM).toBe(8);
    expect(resolveBoardConfig(null)).toEqual({
      maxActiveJobs: 1,
      unclaimedMinutes: 10,
      radiusKm: 8,
      escalationBonusNaira: 0,
      releaseFlagThreshold: 3,
    });
  });

  it("reads configured values and rejects garbage", () => {
    expect(
      resolveBoardConfig({ max_active_jobs: 2, unclaimed_minutes: 5, escalation_bonus_naira: 500 }),
    ).toMatchObject({ maxActiveJobs: 2, unclaimedMinutes: 5, escalationBonusNaira: 500 });
    expect(resolveBoardConfig({ max_active_jobs: 0, unclaimed_minutes: -3 })).toMatchObject({
      maxActiveJobs: 1,
      unclaimedMinutes: 10,
    });
  });
});

describe("boardEligibility", () => {
  const base = { status: "ACTIVE", verification_status: "APPROVED", is_online: true, active_deliveries: 0 };

  it("admits an approved online idle rider", () => {
    expect(boardEligibility(base, 1)).toEqual({ eligible: true, reason: null });
  });

  it("blocks unverified, offline, suspended, and busy riders", () => {
    expect(boardEligibility({ ...base, verification_status: "PENDING" }, 1).reason).toBe("unverified");
    expect(boardEligibility({ ...base, is_online: false }, 1).reason).toBe("offline");
    expect(boardEligibility({ ...base, status: "OFFLINE" }, 1).reason).toBe("offline");
    expect(boardEligibility({ ...base, status: "SUSPENDED" }, 1).reason).toBe("suspended");
    expect(boardEligibility({ ...base, active_deliveries: 1 }, 1).reason).toBe("busy");
    expect(boardEligibility({ ...base, active_deliveries: 1 }, 2).eligible).toBe(true);
  });
});

describe("boardAreaAllowed", () => {
  it("allows riders with no zone set (legacy relaxation)", () => {
    expect(boardAreaAllowed(null, "Lagos", null, "Lagos", null)).toBe(true);
  });

  it("matches case-insensitively on vendor or drop city/zone", () => {
    expect(boardAreaAllowed("Lekki", "Lagos", "Lekki", "Lagos", null)).toBe(true);
    expect(boardAreaAllowed("ikeja", "Lagos", null, "Ikeja", null)).toBe(true);
    expect(boardAreaAllowed("Abuja", "Lagos", "Lekki", "Lagos", null)).toBe(false);
  });
});

describe("haversineKm", () => {
  it("measures Lagos island to mainland plausibly", () => {
    // Lekki Phase 1 -> Ikeja is roughly 20km by road; straight line ~17km.
    const km = haversineKm(6.4483, 3.4606, 6.6018, 3.3515);
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(30);
  });

  it("returns null without coordinates", () => {
    expect(haversineKm(null, null, 6.6, 3.3)).toBeNull();
    expect(haversineKm(6.4, 3.4, undefined, undefined)).toBeNull();
    expect(haversineKm(NaN, 3.4, 6.6, 3.3)).toBeNull();
  });
});

describe("boardPayout", () => {
  it("adds the configured share plus escalation bonus", () => {
    expect(boardPayout(900, 100, 0)).toBe(900);
    expect(boardPayout(900, 100, 500)).toBe(1400);
    expect(boardPayout(900, 80, 0)).toBe(720);
  });
});

describe("claimConflictMessage", () => {
  it("maps taken to the friendly taken message", () => {
    expect(claimConflictMessage("taken")).toBe("Job already taken");
    expect(claimConflictMessage("area")).toContain("outside your delivery area");
    expect(claimConflictMessage("ineligible")).toContain("not eligible");
  });
});
