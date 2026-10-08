import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { hashPassword } from "@/server/auth/password";
import { createUser, createDeliveryPartnerProfile, createVendorProfile, getUserByEmail, createEmailVerificationToken } from "@/server/auth/store";
import { AFFILIATE_COOKIE, resolveSignupReferrer } from "@/server/affiliates";
import { limitByIp, rateLimitedResponse } from "@/server/rate-limit";
import { startSession, toPublicUser } from "@/server/auth/session-flow";
import { generateOpaqueToken, hashToken } from "@/server/auth/tokens";
import { getEnv } from "@/server/env";
import { sendVerificationEmail } from "@/server/email";

const registerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.email("Enter a valid email address"),
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number").nullish(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  role: z.enum(["customer", "vendor", "rider"]).default("customer"),
});

function dbRole(role: "customer" | "vendor" | "rider"): "CUSTOMER" | "VENDOR" | "DELIVERY_PARTNER" {
  if (role === "vendor") return "VENDOR";
  if (role === "rider") return "DELIVERY_PARTNER";
  return "CUSTOMER";
}

function uniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function POST(request: NextRequest) {
  // Captured for the insert-race path below (input stays try-scoped).
  let signupEmail = "";
  try {
    const limit = limitByIp(request, "register", 10);
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter);
    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      throw ApiError.validation("Please fix the errors in your submission.", issues);
    }

    const input = parsed.data;
    signupEmail = input.email;

    // No email-enumeration oracle: an already-registered email gets the same
    // 201 shape (plus a sign-in reminder email) instead of a 409 — no user
    // data, no session. The race between this check and INSERT (23505) is
    // handled identically below.
    const existing = await getUserByEmail(input.email);
    if (existing) {
      await sendExistingAccountReminder(input.email).catch(() => undefined);
      return NextResponse.json(ok({ registered: true, existingAccount: true }), { status: 201 });
    }

    // Referral attribution for NEW signups only: save the referrer from the
    // /ref/[code] cookie once (never updated afterwards). Invalid codes and
    // self-referrals (same phone) resolve to null — signup always succeeds.
    const referredByAffiliateId = await resolveSignupReferrer(
      request.cookies.get(AFFILIATE_COOKIE)?.value ?? null,
      input.phone ?? null,
    ).catch(() => null);

    const passwordHash = await hashPassword(input.password);
    const role = dbRole(input.role);
    const user = await createUser({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? undefined,
      role,
      referredByAffiliateId,
    });

    if (role === "VENDOR") {
      await createVendorProfile({
        userId: user.id,
        businessName: `${input.firstName}'s Kitchen`,
        ownerName: `${input.firstName} ${input.lastName}`.trim(),
        phone: input.phone ?? undefined,
        email: input.email,
      });
    } else if (role === "DELIVERY_PARTNER") {
      await createDeliveryPartnerProfile({
        userId: user.id,
        name: `${input.firstName} ${input.lastName}`.trim(),
        phone: input.phone ?? undefined,
      });
    }

    const response = NextResponse.json(ok(toPublicUser(user), { registered: true }), {
      status: 201,
    });
    await startSession(response, user, request as unknown as import("next/server").NextRequest);

    // Fire-and-forget verification email: signup must succeed even if email fails.
    try {
      const rawToken = generateOpaqueToken(32);
      await createEmailVerificationToken({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresHours: 24,
      });
      const verifyUrl = `${getEnv().appUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
      await sendVerificationEmail(user.email, verifyUrl);
    } catch (emailError) {
      console.error("[auth] failed to send verification email:", emailError);
    }

    return response;
  } catch (error) {
    if (uniqueViolation(error)) {
      // Lost the insert race: same generic 201 as the pre-check path.
      await sendExistingAccountReminder(signupEmail).catch(() => undefined);
      return NextResponse.json(ok({ registered: true, existingAccount: true }), { status: 201 });
    }
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

/** Sign-in reminder for already-registered emails. Fire-and-forget. */
async function sendExistingAccountReminder(email: string): Promise<void> {
  const { sendEmail } = await import("@/server/email");
  await sendEmail({
    to: email,
    subject: "Savora Food — you already have an account",
    text: `Someone tried to register with this email address. You already have a Savora Food account — sign in at ${getEnv().appUrl}/login instead. If this wasn't you, you can safely ignore this email.`,
  });
}