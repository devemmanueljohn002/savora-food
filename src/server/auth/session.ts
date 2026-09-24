import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { getEnv } from "../env";
import { ApiError } from "../errors";

export const ACCESS_COOKIE = "savora.access";
export const REFRESH_COOKIE = "savora.refresh";

export type SessionUser = {
  id: string;
  role: string;
  email: string;
};

type AccessTokenClaims = SessionUser & {
  iat: number;
  exp: number;
  iss: string;
};

const encoder = new TextEncoder();

export function accessCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  const { accessTokenTtlMinutes } = getEnv();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: accessTokenTtlMinutes * 60,
  };
}

export function refreshCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  const { refreshTokenTtlDays } = getEnv();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: refreshTokenTtlDays * 24 * 60 * 60,
  };
}

export async function signSessionToken(user: SessionUser): Promise<string> {
  const { jwtSecret, jwtIssuer, accessTokenTtlMinutes } = getEnv();
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ id: user.id, role: user.role, email: user.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setIssuer(jwtIssuer)
    .setAudience("savora-frontend")
    .setSubject(user.id)
    .setExpirationTime(now + accessTokenTtlMinutes * 60)
    .sign(encoder.encode(jwtSecret));
}

export async function verifySessionToken(token: string): Promise<SessionUser> {
  const { jwtSecret, jwtIssuer } = getEnv();

  try {
    const { payload } = await jwtVerify<AccessTokenClaims>(token, encoder.encode(jwtSecret), {
      issuer: jwtIssuer,
      audience: "savora-frontend",
    });

    if (!payload.id || !payload.role) {
      throw new ApiError("UNAUTHORIZED", "Invalid session token");
    }

    return { id: payload.id, role: payload.role, email: payload.email };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("UNAUTHORIZED", "Your session has expired. Please sign in again.");
  }
}

function setCookie(
  response: NextResponse,
  name: string,
  value: string,
  options: ReturnType<typeof accessCookieOptions>,
): void {
  response.cookies.set({
    name,
    value,
    ...options,
  });
}

export async function attachAuthCookies(
  response: NextResponse,
  user: SessionUser,
): Promise<void> {
  const access = await signSessionToken(user);
  setCookie(response, ACCESS_COOKIE, access, accessCookieOptions());
}

export async function attachRefreshCookie(
  response: NextResponse,
  refreshToken: string,
): Promise<void> {
  setCookie(response, REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, "", { ...accessCookieOptions(), maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...refreshCookieOptions(), maxAge: 0 });
}

export function publicUserPayload(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
  phone?: string | null;
}): {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  phone?: string | null;
} {
  return {
    id: user.id,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.email,
    role: user.role,
    phone: user.phone ?? null,
  };
}