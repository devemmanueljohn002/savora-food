import { NextResponse, type NextRequest } from "next/server";
import { AFFILIATE_COOKIE, getCommissionConfig, recordClick } from "@/server/affiliates";

/**
 * Referral link landing: /ref/JOHN123. Logs the click, plants the 7-day
 * attribution cookie (always overwritten → most recent click wins), then
 * sends the shopper to the homepage. Unknown/inactive codes still redirect
 * (no cookie) so links never 404.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const clean = code.trim().toUpperCase();
  const home = new URL("/", request.url);
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

  const config = await getCommissionConfig().catch(() => null);
  const days = config?.attributionDays ?? 7;
  response.cookies.set(AFFILIATE_COOKIE, affiliate.code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: days * 24 * 60 * 60,
  });
  return response;
}
