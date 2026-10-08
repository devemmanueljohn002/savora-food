import { NextResponse } from "next/server";
import { okMessage, toEnvelope } from "@/server/errors";
import { REFRESH_COOKIE, clearAuthCookies } from "@/server/auth/session";
import { getSessionByRefreshHash, revokeAllSessionsForUser, revokeSession } from "@/server/auth/store";
import { hashToken } from "@/server/auth/tokens";

export async function POST(request: import("next/server").NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (refreshToken) {
      const session = await getSessionByRefreshHash(hashToken(refreshToken));
      if (session) {
        await revokeSession(session.session_id);
        // Global logout: bump the token generation so previously minted
        // access tokens (including on other devices) stop verifying.
        await revokeAllSessionsForUser(session.id).catch(() => undefined);
      }
    }

    const response = NextResponse.json(okMessage("Signed out."));
    clearAuthCookies(response);
    return response;
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}