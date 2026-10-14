import { z } from "zod";

/**
 * Stored URLs (documents, logos, banners) are rendered in apps/admin views:
 * only https: URLs on approved hosts may be persisted — never javascript:,
 * data:, or arbitrary origins.
 */
const IMAGE_HOSTS = ["res.cloudinary.com"];
/**
 * Hosts this deployment is allowed to persist as stored image URLs, resolved
 * from the environment so tearing down one Vercel project (or moving to a
 * custom domain) never leaves a stale hardcoded domain behind.
 */
function ownHosts(): string[] {
  const hosts: string[] = [];
  for (const raw of [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.APP_URL]) {
    const value = raw?.trim().replace(/\/+$/, "");
    if (!value) continue;
    try {
      hosts.push(new URL(value).hostname.toLowerCase());
    } catch {
      // Misconfigured origin — ignore rather than fail open.
    }
  }
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().toLowerCase();
  if (vercelProd) hosts.push(vercelProd);
  return hosts;
}

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
        // This app's own deployed origins (SITE_URL / APP_URL / Vercel
        // production host, resolved from env) plus any Vercel preview
        // deployment of this project.
        if (ownHosts().some((allowed) => host === allowed)) return true;
        if (host.endsWith(".vercel.app")) return true;
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
