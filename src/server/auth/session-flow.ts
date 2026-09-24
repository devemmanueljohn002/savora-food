import type { NextRequest, NextResponse } from "next/server";
import { getEnv } from "../env";
import { attachAuthCookies, attachRefreshCookie, publicUserPayload, type SessionUser } from "./session";
import { createSession, touchLastLogin, type UserRow } from "./store";
import { generateOpaqueToken, hashToken } from "./tokens";

function clientIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || undefined;
}

export async function startSession(response: NextResponse, user: UserRow, request: NextRequest): Promise<void> {
  const env = getEnv();
  const refreshToken = generateOpaqueToken();
  const session = await createSession({
    userId: user.id,
    refreshTokenHash: hashToken(refreshToken),
    refreshTokenTtlDays: env.refreshTokenTtlDays,
    userAgent: request.headers.get("user-agent") ?? undefined,
    ipAddress: clientIp(request),
  });

  const sessionUser: SessionUser = { id: user.id, role: user.role, email: user.email };
  await attachAuthCookies(response, sessionUser);
  await attachRefreshCookie(response, refreshToken);
  await touchLastLogin(user.id);

  void session;
}

export function toPublicUser(user: Pick<UserRow, "id" | "first_name" | "last_name" | "email" | "role" | "phone">) {
  return publicUserPayload({
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    role: user.role,
    phone: user.phone,
  });
}