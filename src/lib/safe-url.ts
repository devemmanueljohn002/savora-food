import { z } from "zod";

/**
 * Stored URLs (documents, logos, banners) are rendered in apps/admin views:
 * only https: URLs on approved hosts may be persisted — never javascript:,
 * data:, or arbitrary origins.
 */
const IMAGE_HOSTS = ["res.cloudinary.com"];

export function storedImageUrl(field = "Enter a valid image URL."): z.ZodType<string | null | undefined> {
  return z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .refine(
      (value) => {
        if (!value) return true;
        // Same-origin relative uploads (e.g. /uploads/2026/01/uuid.jpg).
        if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          return false;
        }
        if (parsed.protocol !== "https:") return false;
        const host = parsed.hostname.toLowerCase();
        if (IMAGE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return true;
        // This app's own deployed origins (site URL / app URL / Vercel).
        if (host === "savora-food.vercel.app" || host.endsWith(".savora-food.vercel.app")) return true;
        return false;
      },
      { message: field },
    );
}

export function storedDocumentUrl(field = "Upload a document first."): z.ZodType<string> {
  return z
    .string()
    .trim()
    .min(1, field)
    .max(500)
    .refine(
      (value) => {
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          return false;
        }
        return parsed.protocol === "https:";
      },
      { message: "Enter a valid document URL." },
    );
}
