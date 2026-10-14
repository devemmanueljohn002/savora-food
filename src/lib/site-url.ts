/**
 * Public site origin for absolute URLs (canonical, sitemap, robots, OG).
 * SITE_URL wins so switching to a custom domain is one env change; APP_URL
 * (required server-side) and the Vercel-provided production URL cover the
 * rest. Never throws, so build-time metadata can safely use it.
 *
 * NOTE: there is no hardcoded production fallback on purpose — the previous
 * savora-food.vercel.app deployment was deleted, so a stale default would
 * silently build canonical links, sitemap URLs and OG images pointing at a
 * dead domain. Resolution order:
 *   1. SITE_URL / NEXT_PUBLIC_SITE_URL (explicit, preferred in production)
 *   2. APP_URL (required server-side; the stable production domain in prod)
 *   3. VERCEL_PROJECT_PRODUCTION_URL (stable production host on Vercel)
 *   4. VERCEL_URL (current deployment URL — preview builds)
 *   5. http://localhost:3000 (local dev last resort)
 */
export function siteUrl(): string {
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const vercelCurrent = process.env.VERCEL_URL?.trim();
  const raw = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_URL ??
    (vercelProd ? `https://${vercelProd}` : null) ??
    (vercelCurrent ? `https://${vercelCurrent}` : null) ??
    "http://localhost:3000"
  ).trim();
  const clean = raw.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production" && clean.startsWith("http://")) {
    console.warn("[site-url] WARNING: resolved site URL uses http:// in production. Set SITE_URL (or APP_URL) to the stable https production domain.");
  }
  return clean || "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${clean}`;
}
