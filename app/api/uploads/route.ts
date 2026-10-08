import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import { sniffImage } from "@/server/storage/photos";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "@/server/cloudinary";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/**
 * Image upload. When Cloudinary env vars are set (production on Vercel),
 * files go to Cloudinary and a CDN URL is returned. Otherwise files land in
 * `public/uploads/<year>/<month>/` for local development only — Vercel's
 * filesystem is ephemeral, so local uploads will not persist in production.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const throttle = checkRateLimit(`rl:uploads:${session.id}`, 20);
    if (!throttle.ok) return rateLimitedResponse(throttle.retryAfter);
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      throw ApiError.validation("Attach an image file as the `file` field.");
    }
    if (!ALLOWED.has(file.type)) {
      throw ApiError.validation("Only JPEG, PNG, WebP or GIF images are allowed.");
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw ApiError.validation("Image must be smaller than 5 MB.");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // Validate the real bytes, not the client-supplied MIME/size: magic-byte
    // sniff for JPEG/PNG/WebP (must match the claimed type), GIF89a/87a
    // header for GIFs. Rejects polyglots and renamed executables.
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_BYTES) {
      throw ApiError.validation("Image must be smaller than 5 MB.");
    }
    if (file.type === "image/gif") {
      const header = bytes.subarray(0, 6).toString("ascii");
      if (header !== "GIF87a" && header !== "GIF89a") {
        throw ApiError.validation("That file is not a valid GIF image.");
      }
    } else {
      const sniffed = sniffImage(bytes);
      if (!sniffed || extensionFor(file.type) !== sniffed.format) {
        throw ApiError.validation("That file is not a valid image.");
      }
    }
    const filename = `${randomUUID()}.${extensionFor(file.type)}`;

    if (isCloudinaryConfigured()) {
      const uploaded = await uploadImageToCloudinary(bytes, file.type, filename).catch((error) => {
        throw ApiError.internal(error instanceof Error ? error.message : "Image upload failed.");
      });
      return NextResponse.json(
        ok({ url: uploaded.url, size: file.size, contentType: file.type }),
        { status: 201 },
      );
    }

    if (process.env.VERCEL) {
      throw ApiError.internal(
        "Image uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
      );
    }

    const now = new Date();
    const dir = path.join(
      process.cwd(),
      "public",
      "uploads",
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
    );
    await mkdir(dir, { recursive: true });

    await writeFile(path.join(dir, filename), bytes);

    const url = `/uploads/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${filename}`;
    return NextResponse.json(ok({ url, size: file.size, contentType: file.type }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
