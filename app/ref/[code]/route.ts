import { NextResponse, type NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/site-url";
import { AFFILIATE_COOKIE, recordClick } from "@/server/affiliates";

/** Link-preview crawlers (WhatsApp, X, Facebook…) that need OG tags. */
const BOT_UA =
  /bot|crawl|spider|slurp|mediapartners|baidu|yandex|sogou|exabot|facebot|facebookexternalhit|twitterbot|linkedinbot|embedly|quora|pinterest|slackbot|discordbot|telegrambot|whatsapp|semrush|ahrefs/i;

const PREVIEW_TITLE = "Savora Food | Your Food. Your Choice. Delivered.";
const PREVIEW_DESCRIPTION =
  "Savora Food delivers hot, freshly cooked meals from trusted local kitchens. Your Food. Your Choice. Delivered.";

/**
 * Same metadata as the homepage so /ref/[code] link previews render the
 * branded 1200x630 image. Bots never trigger the redirect/attribution flow.
 */
function previewHtml(code: string): string {
  const image = absoluteUrl("/og-image.jpg");
  const home = absoluteUrl("/");
  const pageUrl = absoluteUrl(`/ref/${encodeURIComponent(code)}`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${PREVIEW_TITLE}</title>
<meta name="description" content="${PREVIEW_DESCRIPTION}" />
<link rel="canonical" href="${home}" />
<meta property="og:title" content="${PREVIEW_TITLE}" />
<meta property="og:description" content="${PREVIEW_DESCRIPTION}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Savora Food" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Savora Food" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${PREVIEW_TITLE}" />
<meta name="twitter:description" content="${PREVIEW_DESCRIPTION}" />
<meta name="twitter:image" content="${image}" />
<meta http-equiv="refresh" content="0;url=${home}" />
</head>
<body>
<p><a href="${home}">Continue to Savora Food</a></p>
</body>
</html>`;
}

/**
 * Referral link landing: /ref/JOHN123. Logs the click, plants the 30-day
 * httpOnly attribution cookie (always overwritten → most recent click wins),
 * then sends the shopper to the public homepage. Never shows referrer data
 * and never logs anyone in. Unknown/inactive codes still redirect (no cookie)
 * so links never 404.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const clean = code.trim().toUpperCase();
  const home = new URL("/", request.url);

  // Crawlers get metadata HTML (same OG/Twitter tags as the homepage) so
  // link previews render the image. No redirect, no click recorded, no cookie.
  if (BOT_UA.test(request.headers.get("user-agent") ?? "")) {
    return new Response(previewHtml(clean || code.trim()), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const response = NextResponse.redirect(home);

  if (!clean) return response;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip");
  const affiliate = await recordClick(
    clean,
    ip ?? null,
    request.headers.get("user-agent"),
  ).catch(() => undefined);
  if (!affiliate) return response;

  // 30-day httpOnly referral cookie (last click wins — each visit overwrites).
  response.cookies.set(AFFILIATE_COOKIE, affiliate.code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
