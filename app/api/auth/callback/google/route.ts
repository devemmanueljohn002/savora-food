import { NextResponse, type NextRequest } from "next/server";
import { startSession } from "@/server/auth/session-flow";
import {
  attachGoogleSub,
  createUser,
  getUserByEmail,
  getUserByGoogleSub,
} from "@/server/auth/store";
import {
  decideGoogleLink,
  exchangeGoogleCode,
  fetchGoogleProfile,
  googlePasswordPlaceholder,
  sanitizeNext,
} from "@/server/auth/google";
import { getDashboardRouteForRole } from "@/lib/role-routes";
import { ApiError } from "@/server/errors";
import { db } from "@/server/db";

function fail(request: NextRequest, code: string, next: string | null): NextResponse {
  const url = new URL("/auth", request.url);
  url.searchParams.set("error", code);
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

/**
 * Google OAuth callback. Verifies the email with Google, then either signs
 * into the linked account, links a verified-email match, or creates a new
 * CUSTOMER account — all ending in the same session cookies as email login,
 * so role routing behaves identically.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = sanitizeNext(params.get("state"));
  try {
    if (params.get("error")) {
      return fail(request, "cancelled", next);
    }
    const code = params.get("code")?.trim();
    if (!code) {
      return fail(request, "failed", next);
    }

    const accessToken = await exchangeGoogleCode(code);
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
        user = await createUser({
          email: profile.email,
          passwordHash: googlePasswordPlaceholder(),
          firstName: profile.firstName,
          lastName: profile.lastName,
          role: "CUSTOMER",
          googleSub: profile.sub,
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
    await startSession(response, user, request);
    return response;
  } catch {
    return fail(request, "failed", next);
  }
}
