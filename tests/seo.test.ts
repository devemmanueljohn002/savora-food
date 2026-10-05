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
