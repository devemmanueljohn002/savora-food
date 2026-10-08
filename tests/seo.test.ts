import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { absoluteUrl, siteUrl } from "@/lib/site-url";

describe("siteUrl", () => {
  it("strips trailing slashes and never throws", () => {
    const previous = process.env.SITE_URL;
    process.env.SITE_URL = "https://example.com///";
    try {
      expect(siteUrl()).toBe("https://example.com");
      expect(absoluteUrl("sitemap.xml")).toBe("https://example.com/sitemap.xml");
      expect(absoluteUrl("/vendor/slug")).toBe("https://example.com/vendor/slug");
    } finally {
      if (previous === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = previous;
    }
  });
});

/** Read width/height from a JPEG's Start-Of-Frame marker (no image deps). */
function jpegDimensions(file: Buffer): { width: number; height: number } {
  if (file[0] !== 0xff || file[1] !== 0xd8) throw new Error("Not a JPEG (missing SOI).");
  let offset = 2;
  while (offset < file.length) {
    if (file[offset] !== 0xff) throw new Error("Corrupt JPEG markers.");
    const marker = file[offset + 1];
    offset += 2;
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    const length = file.readUInt16BE(offset);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: file.readUInt16BE(offset + 3), width: file.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error("No SOF marker found.");
}

describe("og:image", () => {
  it("is a 1200x630 JPEG under 300KB in /public", () => {
    const path = join(process.cwd(), "public", "og-image.jpg");
    expect(statSync(path).size).toBeLessThan(300 * 1024);
    expect(jpegDimensions(readFileSync(path))).toEqual({ width: 1200, height: 630 });
  });

  it("resolves to the absolute production URL", () => {
    const previous = {
      SITE_URL: process.env.SITE_URL,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      APP_URL: process.env.APP_URL,
    };
    delete process.env.SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.APP_URL;
    try {
      expect(siteUrl()).toBe("https://savora-food.vercel.app");
      expect(absoluteUrl("/og-image.jpg")).toBe("https://savora-food.vercel.app/og-image.jpg");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
