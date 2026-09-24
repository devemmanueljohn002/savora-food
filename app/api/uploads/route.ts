import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/**
 * Local image upload (development/single-server). Files land in
 * `public/uploads/<year>/<month>/` and are served same-origin.
 * INTEGRATION POINT: swap for Cloudinary/S3 when object storage is configured.
 */
export async function POST(request: NextRequest) {
  try {
    await requireSession(request);
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

    const now = new Date();
    const dir = path.join(
      process.cwd(),
      "public",
      "uploads",
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
    );
    await mkdir(dir, { recursive: true });

    const name = `${randomUUID()}.${extensionFor(file.type)}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, name), bytes);

    const url = `/uploads/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${name}`;
    return NextResponse.json(ok({ url, size: file.size, contentType: file.type }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
