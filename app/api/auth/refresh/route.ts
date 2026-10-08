import { NextResponse } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import {
  REFRESH_COOKIE,
  attachAuthCookies,
  attachRefreshCookie,
  type SessionUser,
} from "@/server/auth/session";
import {
  findUserByRevokedRefreshHash,
  getSessionByRefreshHash,
  revokeAllSessionsForUser,
  rotateRefreshSession,
  type UserRow,
} from "@/server/auth/store";
import { generateOpaqueToken, hashToken } from "@/server/auth/tokens";
import { limitByIp, rateLimitedResponse } from "@/server/rate-limit";
import { getEnv } from "@/server/env";
import { toPublicUser } from "@/server/auth/session-flow";

export async function POST(request: import("next/server").NextRequest) {
  try {
    const limit = limitByIp(request, "refresh", 30);
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter);
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }

    const session = await getSessionByRefreshHash(hashToken(refreshToken));
    if (!session) {
      // Reuse detection: an already-rotated token presented again means the
      // token was likely stolen — burn every session for that user, not just
      // this one. Unknown tokens still get the plain expiry message.
      const stolenFrom = await findUserByRevokedRefreshHash(hashToken(refreshToken)).catch(() => undefined);
      if (stolenFrom) {
        await revokeAllSessionsForUser(stolenFrom).catch(() => undefined);
      }
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }

    const env = getEnv();
    const newRefreshToken = generateOpaqueToken();
    const newSession = await rotateRefreshSession({
      oldSessionId: session.session_id,
      userId: session.id,
      refreshTokenHash: hashToken(newRefreshToken),
      refreshTokenTtlDays: env.refreshTokenTtlDays,
      userAgent: request.headers.get("user-agent") ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    });

    const sessionUser: SessionUser = { id: session.id, role: session.role, email: session.email, tokenVersion: session.token_version ?? 0 };
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