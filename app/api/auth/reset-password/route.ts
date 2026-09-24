import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, okMessage, toEnvelope } from "@/server/errors";
import { hashPassword } from "@/server/auth/password";
import { consumePasswordResetToken, revokeAllSessionsForUser, updatePassword } from "@/server/auth/store";
import { hashToken } from "@/server/auth/tokens";

const resetSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const { token, password } = parsed.data;
    const user = await consumePasswordResetToken(hashToken(token));
    if (!user) {
      throw ApiError.unauthorized("This reset link is invalid or has expired. Request a new one.");
    }

    const passwordHash = await hashPassword(password);
    await updatePassword(user.id, passwordHash);
    await revokeAllSessionsForUser(user.id);

    return NextResponse.json(okMessage("Password updated. You can now sign in."));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}