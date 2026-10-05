import { ApiError } from "./errors";

const EPHEMERAL_UPLOAD_PREFIX = "/uploads/";

/**
 * Local `/uploads/…` URLs only survive on the machine that wrote them:
 * `public/uploads/` is gitignored and Vercel's filesystem is ephemeral, so
 * any such URL saved from production is a guaranteed broken image.
 * Reject it with an actionable vendor-facing error instead of persisting it.
 * Local development (no VERCEL env) keeps working as before.
 */
export function assertPersistentImageUrl(imageUrl: string | null | undefined): void {
  if (
    typeof imageUrl === "string" &&
    imageUrl.startsWith(EPHEMERAL_UPLOAD_PREFIX) &&
    process.env.VERCEL
  ) {
    throw ApiError.validation("This image didn't persist. Please re-upload the product image.");
  }
}

/** Empty strings carry no image — store NULL so cards render the fallback. */
export function normalizeImageUrl(imageUrl: string | null | undefined): string | null | undefined {
  if (imageUrl === undefined) return undefined;
  if (imageUrl === null) return null;
  return imageUrl.trim() ? imageUrl : null;
}
