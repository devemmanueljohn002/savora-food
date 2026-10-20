import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { verifyPassword } from "@/server/auth/password";
import { getUserByEmailOrPhone } from "@/server/auth/store";
import { startSession, toPublicUser } from "@/server/auth/session-flow";
import { getPostLoginRouteForRole } from "@/lib/role-routes";
import { limitByIp, rateLimitedResponse } from "@/server/rate-limit";

// Only identifier + password are accepted. Any extra body field (notably the
// signup role dropdown, if a client ever sends it) is stripped by zod and has
// no effect — the role is read from the stored user row below.
const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or phone number"),
  password: z.string().min(1, "Enter your password").max(128),
});

export async function POST(request: Request) {
  try {
    const limit = limitByIp(request, "login", 10);
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter);
    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const { identifier, password } = parsed.data;

    const user = await getUserByEmailOrPhone(identifier);
    if (!user) {
      throw ApiError.unauthorized("Invalid email/phone or password.");
    }
    // Suspended accounts get the identical response: a distinct 403 would
    // disclose which identifiers are suspended (account-status oracle).
    if (user.status !== "ACTIVE") {
      throw ApiError.unauthorized("Invalid email/phone or password.");
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      throw ApiError.unauthorized("Invalid email/phone or password.");
    }

    // Destination is computed from the STORED role (never client input):
    // ADMIN -> /admin, everyone else -> their role dashboard.
    const redirectTo = getPostLoginRouteForRole(user.role);
    const response = NextResponse.json(ok(toPublicUser(user), { redirectTo }));
    await startSession(response, user, request as unknown as import("next/server").NextRequest);
    return response;
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}