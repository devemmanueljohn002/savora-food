import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { verifyPassword } from "@/server/auth/password";
import { getUserByEmailOrPhone } from "@/server/auth/store";
import { startSession, toPublicUser } from "@/server/auth/session-flow";

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or phone number"),
  password: z.string().min(1, "Enter your password").max(128),
});

export async function POST(request: Request) {
  try {
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
    if (user.status !== "ACTIVE") {
      throw ApiError.forbidden("This account has been suspended. Contact support.");
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      throw ApiError.unauthorized("Invalid email/phone or password.");
    }

    const response = NextResponse.json(ok(toPublicUser(user)));
    await startSession(response, user, request as unknown as import("next/server").NextRequest);
    return response;
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}