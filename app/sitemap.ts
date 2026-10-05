import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const STATIC_ROUTES = [
  "/",
  "/food",
  "/snacks",
  "/drinks",
  "/cakes",
  "/vendors",
  "/catering",
  "/about",
  "/contact",
];

/**
 * Public crawl surface: static pages plus every approved vendor and every
 * purchasable product. Filtered/sorted catalog URLs are intentionally
 * excluded (canonical base paths only). Runs on demand (never at build).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));

  try {
    const sql = db();
    const vendors = await sql<{ slug: string; updated_at: Date }[]>`
      SELECT slug, updated_at FROM vendors
      WHERE status = 'APPROVED' AND slug IS NOT NULL AND slug <> ''
      ORDER BY slug ASC LIMIT 2000
    `;
    for (const vendor of vendors) {
      entries.push({
        url: `${base}/vendor/${vendor.slug}`,
        lastModified: vendor.updated_at ?? new Date(),
      });
    }
    const products = await sql<{ slug: string; updated_at: Date }[]>`
      SELECT p.slug, p.updated_at FROM products p
      JOIN vendors v ON v.id = p.vendor_id
      WHERE p.is_active = TRUE AND p.slug IS NOT NULL AND p.slug <> ''
        AND v.status = 'APPROVED'
      ORDER BY p.slug ASC LIMIT 5000
    `;
    for (const product of products) {
      entries.push({
        url: `${base}/product/${product.slug}`,
        lastModified: product.updated_at ?? new Date(),
      });
    }
  } catch {
    // DB unreachable: still serve the static routes rather than 500.
  }

  return entries;
}
