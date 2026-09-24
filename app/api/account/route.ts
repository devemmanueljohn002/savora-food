import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { getUserById, getVendorByUserId, updateUserProfile } from "@/server/auth/store";
import { toPublicUser } from "@/server/auth/session-flow";
import { db } from "@/server/db";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100).optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(100).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number")
    .optional()
    .nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const user = await getUserById(session.id);
    if (!user) {
      throw ApiError.notFound("Account not found. Your session may be outdated.");
    }

    let vendor: { id: string; businessName: string; slug: string; status: string } | null = null;
    let rider: { id: string; status: string; verificationStatus: string } | null = null;

    if (user.role === "VENDOR") {
      const row = await getVendorByUserId(user.id);
      if (row) {
        vendor = { id: row.id, businessName: row.business_name, slug: row.slug, status: row.status };
      }
    } else if (user.role === "DELIVERY_PARTNER") {
      const rows = await db()<{
        id: string;
        status: string;
        verification_status: string;
      }[]>`SELECT id, status, verification_status FROM delivery_partners WHERE user_id = ${user.id} LIMIT 1`;
      const row = rows[0];
      if (row) {
        rider = { id: row.id, status: row.status, verificationStatus: row.verification_status };
      }
    }

    return NextResponse.json(
      ok({
        user: { ...toPublicUser(user), emailVerifiedAt: user.email_verified_at },
        vendor,
        rider,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const body = await request.json().catch(() => null);
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const user = await updateUserProfile(session.id, {
      ...(parsed.data.firstName !== undefined ? { firstName: parsed.data.firstName } : {}),
      ...(parsed.data.lastName !== undefined ? { lastName: parsed.data.lastName } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone ?? undefined } : {}),
    });
    if (!user) {
      throw ApiError.notFound("Account not found. Your session may be outdated.");
    }

    return NextResponse.json(ok({ ...toPublicUser(user), emailVerifiedAt: user.email_verified_at }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
