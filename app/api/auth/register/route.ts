import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { hashPassword } from "@/server/auth/password";
import { createUser, createDeliveryPartnerProfile, createVendorProfile, getUserByEmail, createEmailVerificationToken } from "@/server/auth/store";
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      throw ApiError.validation("Please fix the errors in your submission.", issues);
    }

    const input = parsed.data;

    const existing = await getUserByEmail(input.email);
    if (existing) {
      throw ApiError.conflict("An account with this email already exists. Try signing in.");
    }

    const passwordHash = await hashPassword(input.password);
    const role = dbRole(input.role);
    const user = await createUser({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? undefined,
      role,
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
      return NextResponse.json(
        toEnvelope(ApiError.conflict("An account with this email already exists. Try signing in.")).envelope,
        { status: 409 },
      );
    }
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}