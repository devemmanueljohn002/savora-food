import { NextResponse, type NextRequest } from "next/server";
import { startSession } from "@/server/auth/session-flow";
import {
  attachGoogleSub,
  createUser,
  getUserByEmail,
  getUserByGoogleSub,
} from "@/server/auth/store";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  decideGoogleLink,
  exchangeGoogleCode,
  fetchGoogleProfile,
  googlePasswordPlaceholder,
  oauthCookieOptions,
  sanitizeNext,
  verifyOAuthState,
} from "@/server/auth/google";
import { getDashboardRouteForRole } from "@/lib/role-routes";
import { ApiError } from "@/server/errors";
import { db } from "@/server/db";
import { AFFILIATE_COOKIE, resolveSignupReferrer } from "@/server/affiliates";

function clearOAuthCookies(response: NextResponse): void {
  const cleared = { ...oauthCookieOptions(), maxAge: 0 };
  response.cookies.set(OAUTH_STATE_COOKIE, "", cleared);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, "", cleared);
  response.cookies.set(OAUTH_NEXT_COOKIE, "", cleared);
}

function fail(request: NextRequest, code: string, next: string | null): NextResponse {
  const url = new URL("/auth", request.url);
  url.searchParams.set("error", code);
  if (next) url.searchParams.set("next", next);
  const response = NextResponse.redirect(url);
  clearOAuthCookies(response);
  return response;
}

/**
 * Google OAuth callback. Verifies the email with Google, then either signs
 * into the linked account, links a verified-email match, or creates a new
 * CUSTOMER account — all ending in the same session cookies as email login,
 * so role routing behaves identically.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // `next` travels in a short-lived httpOnly cookie now that `state` carries
  // the CSRF nonce (fall back to the legacy state-carried value for
  // in-flight logins started before this deploy).
  const next =
    sanitizeNext(request.cookies.get(OAUTH_NEXT_COOKIE)?.value ?? null) ??
    sanitizeNext(params.get("state"));
  try {
    if (params.get("error")) {
      return fail(request, "cancelled", next);
    }
    const code = params.get("code")?.trim();
    if (!code) {
      return fail(request, "failed", next);
    }
    // CSRF + PKCE check: the state nonce must match the cookie via a
    // constant-time compare, and the verifier must still be present.
    // In-flight logins from before this deploy have no cookies — they fail
    // closed here and the user simply retries.
    const state = params.get("state") ?? "";
    const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? "";
    const verifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value ?? "";
    if (!verifyOAuthState(state, expectedState) || !verifier) {
      return fail(request, "failed", next);
    }
    const accessToken = await exchangeGoogleCode(code, verifier);
    const profile = await fetchGoogleProfile(accessToken);

    const sql = db();
    const bySubRows = await getUserByGoogleSub(profile.sub);
    const byEmailRows = await getUserByEmail(profile.email);
    const decision = decideGoogleLink(bySubRows, byEmailRows, profile.emailVerified);
    if (decision.action === "reject") {
      return fail(request, "unverified", next);
    }

    let user = decision.action === "login" || decision.action === "link" ? decision.user : null;
    if (decision.action === "link" && user) {
      try {
        await attachGoogleSub(user.id, profile.sub);
      } catch (error) {
        // Sub already linked elsewhere (unique race): don't hijack it.
        if ((error as { code?: string })?.code === "23505") {
          return fail(request, "linking", next);
        }
        throw error;
      }
      user = (await getUserByEmail(profile.email)) ?? user;
    }
    if (decision.action === "create") {
      try {
        // New Google signups also pick up the /ref/[code] referrer once.
        // Existing/linked accounts are never attached. The verified Google
        // email doubles as the self-referral signal (no phone at this point).
        const referredByAffiliateId = await resolveSignupReferrer(
          request.cookies.get(AFFILIATE_COOKIE)?.value ?? null,
          null,
          profile.email,
        ).catch(() => null);
        user = await createUser({
          email: profile.email,
          passwordHash: googlePasswordPlaceholder(),
          firstName: profile.firstName,
          lastName: profile.lastName,
          role: "CUSTOMER",
          googleSub: profile.sub,
          referredByAffiliateId,
        });
      } catch (error) {
        // Email registered between check and insert: fall back to linking.
        if ((error as { code?: string })?.code !== "23505") throw error;
        const existing = await getUserByEmail(profile.email);
        if (!existing) throw ApiError.internal("Could not create your account. Please try again.");
        await attachGoogleSub(existing.id, profile.sub).catch(() => undefined);
        user = existing;
      }
      await sql`
        UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
        WHERE id = ${user.id}
      `;
    }
    if (!user) {
      return fail(request, "failed", next);
    }
    if (user.status !== "ACTIVE") {
      return fail(request, "suspended", next);
    }

    const response = NextResponse.redirect(new URL(next ?? getDashboardRouteForRole(user.role), request.url));
    clearOAuthCookies(response);
    await startSession(response, user, request);
    return response;
  } catch {
    return fail(request, "failed", next);
  }
}
