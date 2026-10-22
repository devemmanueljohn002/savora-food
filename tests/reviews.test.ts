import { describe, expect, it } from "vitest";

import { sanitizeReviewComment } from "@/server/reviews";
import { MIN_VENDOR_RATING_REVIEWS } from "@/lib/review-types";

describe("review comments", () => {
  it("strips HTML tags and control characters", () => {
    expect(sanitizeReviewComment("<b>Great</b> food<script>alert(1)</script>")).toBe("Great food alert(1)");
    expect(sanitizeReviewComment("Line\u0000one\nline two")).toBe("Lineone\nline two");
  });

  it("keeps plain text and treats blank input as no comment", () => {
    expect(sanitizeReviewComment("  Jollof was perfect  ")).toBe("Jollof was perfect");
    expect(sanitizeReviewComment("   ")).toBeNull();
    expect(sanitizeReviewComment("<b></b>")).toBeNull();
    expect(sanitizeReviewComment(null)).toBeNull();
  });

  it("caps comments at 500 characters", () => {
    expect(sanitizeReviewComment("a".repeat(600))).toHaveLength(500);
  });

  it("uses the documented minimum-review threshold", () => {
    expect(MIN_VENDOR_RATING_REVIEWS).toBe(5);
  });
});
