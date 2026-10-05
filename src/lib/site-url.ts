/**
 * Public site origin for absolute URLs (canonical, sitemap, robots, OG).
 * SITE_URL wins so switching to a custom domain is one env change; APP_URL
 * (required server-side) and the production fallback cover the rest. Never
 * throws, so build-time metadata can safely use it.
 */
export function siteUrl(): string {
  const raw = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_URL ??
    "https://savora-food.vercel.app"
  ).trim();
  return raw.replace(/\/+$/, "") || "https://savora-food.vercel.app";
}

export function absoluteUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${clean}`;
}
