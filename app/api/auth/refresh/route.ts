import { NextResponse } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import {
  REFRESH_COOKIE,
  attachAuthCookies,
  attachRefreshCookie,
  type SessionUser,
} from "@/server/auth/session";
import {
  createSession,
  getSessionByRefreshHash,
  revokeSession,
  type UserRow,
} from "@/server/auth/store";
import { generateOpaqueToken, hashToken } from "@/server/auth/tokens";
import { getEnv } from "@/server/env";
import { toPublicUser } from "@/server/auth/session-flow";

export async function POST(request: import("next/server").NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }

    const session = await getSessionByRefreshHash(hashToken(refreshToken));
    if (!session) {
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }

    const env = getEnv();
    const newRefreshToken = generateOpaqueToken();
    const newSession = await createSession({
      userId: session.id,
      refreshTokenHash: hashToken(newRefreshToken),
      refreshTokenTtlDays: env.refreshTokenTtlDays,
      userAgent: request.headers.get("user-agent") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    });
    await revokeSession(session.session_id);

    const sessionUser: SessionUser = { id: session.id, role: session.role, email: session.email };
    const response = NextResponse.json(
      ok(toPublicUser(session as unknown as UserRow), { rotated: true, sessionId: newSession.id }),
    );
    await attachAuthCookies(response, sessionUser);
    await attachRefreshCookie(response, newRefreshToken);
    return response;
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}