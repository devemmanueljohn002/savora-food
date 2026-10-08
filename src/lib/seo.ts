import { absoluteUrl } from "./site-url";

/**
 * Default link-preview image (1200×630 JPEG in /public).
 *
 * Spread these into page-level openGraph/twitter objects. Page-level
 * metadata replaces layout-level tags for these objects, so the layout's
 * og:image alone never reaches a page that defines its own tags — every
 * page with custom openGraph/twitter must include these spreads.
 */
export const DEFAULT_OG_IMAGE_URL = absoluteUrl("/og-image.jpg");

export const DEFAULT_OG_IMAGES = {
  images: [{ url: DEFAULT_OG_IMAGE_URL, width: 1200, height: 630, alt: "Savora Food" }],
};

export const DEFAULT_TWITTER_IMAGE = {
  card: "summary_large_image" as const,
  images: [DEFAULT_OG_IMAGE_URL],
};
