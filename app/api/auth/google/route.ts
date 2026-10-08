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

/** Start "Continue with Google": mint CSRF state + PKCE verifier cookies,
 *  then bounce the browser to Google's consent page. */
export async function GET(request: NextRequest) {
  const next = sanitizeNext(request.nextUrl.searchParams.get("next"));
  try {
    const state = newOAuthState();
    const verifier = newCodeVerifier();
    const url = buildGoogleAuthorizeUrl(next, { state, codeChallenge: codeChallengeS256(verifier) });
    const response = NextResponse.redirect(url);
    const options = oauthCookieOptions();
    response.cookies.set(OAUTH_STATE_COOKIE, state, options);
    response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, options);
    if (next) response.cookies.set(OAUTH_NEXT_COOKIE, next, options);
    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/auth?error=setup", request.url),
    );
  }
}
