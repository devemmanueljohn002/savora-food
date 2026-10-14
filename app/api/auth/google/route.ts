import { NextResponse, type NextRequest } from "next/server";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  buildGoogleAuthorizeUrl,
  codeChallengeS256,
  newCodeVerifier,
  newOAuthState,
  oauthCookieOptions,
  sanitizeNext,
} from "@/server/auth/google";
import { limitByIp, rateLimitedResponse } from "@/server/rate-limit";

/** Start "Continue with Google": mint CSRF state + PKCE verifier cookies,
 *  then bounce the browser to Google's consent page. */
export async function GET(request: NextRequest) {
  const next = sanitizeNext(request.nextUrl.searchParams.get("next"));
  try {
    const limit = limitByIp(request, "oauth-start", 30);
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter);
    const state = newOAuthState();
    const verifier = newCodeVerifier();
    const url = buildGoogleAuthorizeUrl(next, { state, codeChallenge: codeChallengeS256(verifier) });
    const response = NextResponse.redirect(url);
    const options = oauthCookieOptions();
    response.cookies.set(OAUTH_STATE_COOKIE, state, options);
    response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, options);
    if (next) response.cookies.set(OAUTH_NEXT_COOKIE, next, options);
    return response;
  } catch (error) {
    // Setup failures (missing AUTH_GOOGLE_ID/SECRET, missing APP_URL) land
    // here: log for Vercel Runtime Logs and bounce to /auth with a code the
    // UI already translates ("setup" = Google sign-in is not set up yet).
    console.error("[auth] google start failed:", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(
      new URL("/auth?error=setup", request.url),
    );
  }
}
