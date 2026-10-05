import { randomBytes } from "crypto";
import { ApiError } from "../errors";
import { getEnv } from "../env";
import type { UserRow } from "./store";

/**
 * Google OAuth ("Continue with Google") on top of the existing session
 * system. No Auth.js: a minimal authorization-code flow that ends in the
 * same startSession() cookies as email login, so role routing is identical.
 *
 * Secrets only ever come from env (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)
 * and are only sent server-to-server to Google. They are never logged,
 * never embedded in responses, and never leave this module.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleCallbackUrl(): string {
  return `${getEnv().appUrl}/api/auth/callback/google`;
}

function requireGoogleConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const { authGoogleId, authGoogleSecret } = getEnv();
  if (!authGoogleId || !authGoogleSecret) {
    throw new ApiError("INTERNAL_ERROR", "Google sign-in is not configured on this server.");
  }
  return { clientId: authGoogleId, clientSecret: authGoogleSecret, redirectUri: googleCallbackUrl() };
}

/** Keep only safe same-origin paths for post-login redirects. */
export function sanitizeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

export function roleHome(role: string): string {
  switch (role) {
    case "VENDOR":
      return "/vendor/dashboard";
    case "DELIVERY_PARTNER":
      return "/rider/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
    case "SUPER_ADMIN":
      return "/super-admin/dashboard";
    default:
      return "/";
  }
}

export function buildGoogleAuthorizeUrl(next: string | null): string {
  const { clientId, redirectUri } = requireGoogleConfig();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  if (next) url.searchParams.set("state", next);
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function postForm(url: string, params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params),
  });
  const body = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !body || body.error) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Google sign-in failed while confirming your account. Please try again.",
    );
  }
  return body;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
};

export async function exchangeGoogleCode(code: string): Promise<string> {
  const { clientId, clientSecret, redirectUri } = requireGoogleConfig();
  const body = await postForm(GOOGLE_TOKEN_URL, {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!body.access_token) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Google sign-in failed while confirming your account. Please try again.",
    );
  }
  return body.access_token;
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const body = (await res.json().catch(() => null)) as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    given_name?: unknown;
    family_name?: unknown;
    name?: unknown;
  } | null;
  const sub = typeof body?.sub === "string" ? body.sub : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!sub || !email) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Google did not return an account email. Please try again.",
    );
  }
  const given = typeof body?.given_name === "string" ? body.given_name.trim() : "";
  const family = typeof body?.family_name === "string" ? body.family_name.trim() : "";
  const full = typeof body?.name === "string" ? body.name.trim() : "";
  const firstName = given || full.split(/\s+/)[0] || email.split("@")[0];
  const lastName = family || full.split(/\s+/).slice(1).join(" ") || "";
  return { sub, email, emailVerified: body?.email_verified === true, firstName, lastName };
}

export type GoogleLinkDecision =
  | { action: "login"; user: UserRow }
  | { action: "link"; user: UserRow }
  | { action: "create" }
  | { action: "reject"; reason: "unverified" };

/**
 * Pure account decision (unit-tested): link by stable Google sub first;
 * fall back to a verified-email match; unverified emails never link.
 */
export function decideGoogleLink(
  bySub: UserRow | undefined,
  byEmail: UserRow | undefined,
  emailVerified: boolean,
): GoogleLinkDecision {
  if (bySub) return { action: "login", user: bySub };
  if (!emailVerified) return { action: "reject", reason: "unverified" };
  if (byEmail) return { action: "link", user: byEmail };
  return { action: "create" };
}

/**
 * Password-hash placeholder for OAuth users. verifyPassword() rejects any
 * value outside the `scrypt$…` format, so this marker can never authenticate
 * a password login — it only satisfies the NOT NULL column.
 */
export function googlePasswordPlaceholder(): string {
  return `google-oauth$${randomBytes(24).toString("base64url")}`;
}
