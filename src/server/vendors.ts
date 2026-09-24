import { ApiError } from "./errors";
import { getVendorByUserId, type VendorRow } from "./auth/store";
import { db } from "./db";

export function slugify(value: string, fallback = "item"): string {
  const slug =
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;
  return slug;
}

export async function uniqueSlug(table: "products" | "vendors", base: string): Promise<string> {
  let slug = base;
  let n = 2;
  const sql = db();
  for (;;) {
    const rows =
      table === "products"
        ? await sql<{ id: string }[]>`SELECT id FROM products WHERE slug = ${slug} LIMIT 1`
        : await sql<{ id: string }[]>`SELECT id FROM vendors WHERE slug = ${slug} LIMIT 1`;
    if (!rows[0]) return slug;
    slug = `${base}-${n++}`;
  }
}

/** Loads the caller's vendor profile, optionally requiring admin approval. */
export async function getVendorContext(userId: string, approvedOnly = true): Promise<VendorRow> {
  const vendor = await getVendorByUserId(userId);
  if (!vendor) {
    throw ApiError.notFound("No vendor profile found for this account.");
  }
  if (approvedOnly && vendor.status !== "APPROVED") {
    throw ApiError.forbidden(
      vendor.status === "PENDING" || vendor.status === "UNDER_REVIEW"
        ? "Your kitchen is still under review. You will get access once an admin approves it."
        : "Your kitchen is not active. Contact support.",
    );
  }
  return vendor;
}

export async function notifyUser(input: {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
}): Promise<void> {
  const sql = db();
  // Round-trip through JSON so the payload satisfies sql.json's JSONValue type.
  const payload = JSON.parse(JSON.stringify(input.data ?? {}));
  await sql`
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      ${input.userId}, ${input.type}, ${input.title}, ${input.body ?? null},
      ${sql.json(payload)}
    )
  `;
}
