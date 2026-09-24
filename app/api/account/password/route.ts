import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, okMessage, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { clearAuthCookies } from "@/server/auth/session";
import { getUserById, revokeAllSessionsForUser, updatePassword } from "@/server/auth/store";
import { hashPassword, verifyPassword } from "@/server/auth/password";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "New password must be at most 128 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const body = await request.json().catch(() => null);
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const user = await getUserById(session.id);
    if (!user) {
      throw ApiError.notFound("Account not found. Your session may be outdated.");
    }

    const valid = await verifyPassword(parsed.data.currentPassword, user.password_hash);
    if (!valid) {
      throw ApiError.unauthorized("Your current password is incorrect.");
    }

    await updatePassword(user.id, await hashPassword(parsed.data.newPassword));
    // Revoke every session (including this one) so stolen sessions die.
    await revokeAllSessionsForUser(user.id);

    const response = NextResponse.json(okMessage("Password updated. Please sign in again."));
    clearAuthCookies(response);
    return response;
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
