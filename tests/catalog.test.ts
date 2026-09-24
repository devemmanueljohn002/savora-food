import { describe, expect, it } from "vitest";
import { firstValue, parseFilters } from "@/lib/catalog-params";

describe("firstValue", () => {
  it("returns a scalar value unchanged", () => {
    expect(firstValue("lagos")).toBe("lagos");
  });

  it("returns the first entry of an array", () => {
    expect(firstValue(["lagos", "abuja"])).toBe("lagos");
  });

  it("returns undefined for missing values", () => {
    expect(firstValue(undefined)).toBeUndefined();
  });
});

describe("parseFilters", () => {
  it("applies defaults when no params are present", () => {
    expect(parseFilters({})).toEqual({
      q: undefined,
      city: undefined,
      sort: undefined,
      page: 1,
    });
  });

  it("trims text filters and keeps a valid page", () => {
    expect(parseFilters({ q: "  jollof  ", city: " Lagos ", sort: "rating", page: "3" })).toEqual({
      q: "jollof",
      city: "Lagos",
      sort: "rating",
      page: 3,
    });
  });

  it("falls back to page 1 for invalid page values", () => {
    expect(parseFilters({ page: "0" }).page).toBe(1);
    expect(parseFilters({ page: "-4" }).page).toBe(1);
    expect(parseFilters({ page: "abc" }).page).toBe(1);
    expect(parseFilters({ page: "2.5" }).page).toBe(1);
  });

  it("reads the first value from repeated query params", () => {
    expect(parseFilters({ q: ["rice", "beans"], city: ["Lagos"] })).toMatchObject({
      q: "rice",
      city: "Lagos",
    });
  });

  it("treats blank strings as absent", () => {
    expect(parseFilters({ q: "   ", city: "" })).toMatchObject({
      q: undefined,
      city: undefined,
    });
  });
});