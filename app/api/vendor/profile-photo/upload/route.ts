import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorContext } from "@/server/vendors";
import { requireS3Config } from "@/server/storage/s3";
import { uploadPostFor, validateUploadDeclaration } from "@/server/storage/photos";

export const runtime = "nodejs";

const bodySchema = z.object({
  // Declared attributes only — the POST policy pins the exact key, exact
  // content type and a 1-byte..5MB range, so S3 itself rejects anything else.
  contentType: z.string().trim().max(100),
  sizeBytes: z.number().int().min(1),
});

/**
 * Mint a browser upload: short-lived presigned POST + server-generated
 * staging key. No AWS credentials ever reach the client; no vendorId is
 * accepted — it comes from the session.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    // approvedOnly=false: a profile photo must never gate order functionality.
    const vendor = await getVendorContext(session.id, false);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const declared = validateUploadDeclaration(parsed.data.contentType, parsed.data.sizeBytes);
    const config = requireS3Config();
    const post = uploadPostFor(config, vendor.id, declared.contentType);

    return NextResponse.json(
      ok({
        url: post.url,
        fields: post.fields,
        key: post.key,
        expiresAt: post.expiresAt,
        maxBytes: post.maxBytes,
      }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Profile photo storage is not configured")) {
      const { envelope } = toEnvelope(ApiError.internal("Profile photo uploads are not available right now."));
      return NextResponse.json(envelope, { status: 503 });
    }
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
