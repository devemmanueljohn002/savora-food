import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { finalizeVendorPhoto } from "@/server/storage/photos";

export const runtime = "nodejs";

const bodySchema = z.object({
  // Opaque staging reference minted by /upload. Shape + vendor prefix are
  // re-validated server-side; anything else is rejected.
  key: z.string().trim().min(1).max(200),
});

/**
 * Validate-and-promote a staged upload into vendors/{id}/profile/.
 * The vendor record is only pointed at a validated, sanitized object.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorContext(session.id, false);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const result = await finalizeVendorPhoto({ vendorId: vendor.id, stagingKey: parsed.data.key });
    return NextResponse.json(ok({ profilePhotoKey: result.profilePhotoKey, replaced: result.replaced }), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Profile photo storage is not configured")) {
      const { envelope } = toEnvelope(ApiError.internal("Profile photo uploads are not available right now."));
      return NextResponse.json(envelope, { status: 503 });
    }
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
