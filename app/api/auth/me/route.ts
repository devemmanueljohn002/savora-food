import { NextResponse } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { toPublicUser } from "@/server/auth/session-flow";
import { getUserById } from "@/server/auth/store";

export async function GET(request: import("next/server").NextRequest) {
  try {
    const session = await requireSession(request);
    const user = await getUserById(session.id);
    if (!user) {
      throw ApiError.notFound("Account not found. Your session may be outdated.");
    }
    return NextResponse.json(ok(toPublicUser(user)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}