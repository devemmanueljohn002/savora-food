import { describe, expect, it, afterEach } from "vitest";

import { assertPersistentImageUrl, normalizeImageUrl } from "@/server/product-images";
import { resolveProductImageSrc, PRODUCT_IMAGE_FALLBACK, PRODUCT_PLACEHOLDER } from "@/components/ProductImage";

describe("product image persistence guard", () => {
  afterEach(() => {
    delete process.env.VERCEL;
  });

  it("rejects local /uploads URLs on Vercel production", () => {
    process.env.VERCEL = "1";
    expect(() => assertPersistentImageUrl("/uploads/2026/09/abc.jpg")).toThrow();
  });

  it("allows /uploads URLs in local dev and CDN URLs everywhere", () => {
    expect(() => assertPersistentImageUrl("/uploads/2026/09/abc.jpg")).not.toThrow();
    process.env.VERCEL = "1";
    expect(() =>
      assertPersistentImageUrl("https://res.cloudinary.com/demo/image/upload/abc.jpg"),
    ).not.toThrow();
    expect(() => assertPersistentImageUrl(null)).not.toThrow();
    expect(() => assertPersistentImageUrl(undefined)).not.toThrow();
  });

  it("normalizes empty strings to NULL so cards render the fallback", () => {
    expect(normalizeImageUrl("")).toBeNull();
    expect(normalizeImageUrl("   ")).toBeNull();
    expect(normalizeImageUrl(null)).toBeNull();
    expect(normalizeImageUrl(undefined)).toBeUndefined();
    expect(normalizeImageUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
  });
});

describe("product image fallback resolution", () => {
  it("uses the shared fallback for null/empty and the placeholder after a load failure", () => {
    expect(resolveProductImageSrc(null, false)).toBe(PRODUCT_IMAGE_FALLBACK);
    expect(resolveProductImageSrc("", false)).toBe(PRODUCT_IMAGE_FALLBACK);
    expect(resolveProductImageSrc("/uploads/2026/09/abc.jpg", false)).toBe("/uploads/2026/09/abc.jpg");
    expect(resolveProductImageSrc("/uploads/2026/09/abc.jpg", true)).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveProductImageSrc(null, true)).toBe(PRODUCT_PLACEHOLDER);
  });
});
