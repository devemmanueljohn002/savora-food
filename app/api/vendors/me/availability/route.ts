import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorByUserId } from "@/server/auth/store";
import { db } from "@/server/db";

const availabilitySchema = z.object({
  isOpen: z.boolean({ error: "isOpen must be true or false." }),
});

/**
 * PATCH /vendors/me/availability — vendor-only Open/Closed ("Accepting
 * Orders") toggle. Closing sets a manual "closed" override that beats the
 * weekly schedule and exceptions; reopening clears the override so the
 * schedule decides again. Approval status, profile fields and everything
 * else are untouched. Closed vendors keep their listings but customers
 * cannot add their items to cart or check out (409 VENDOR_CLOSED).
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const parsed = availabilitySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("isOpen must be true or false.", parsed.error.flatten().fieldErrors);
    }

    const vendor = await getVendorByUserId(session.id);
    if (!vendor) throw ApiError.notFound("No vendor profile found for this account.");

    const rows = await db()<{
      id: string;
      business_name: string;
      slug: string;
      is_open: boolean;
      manual_override: string | null;
    }[]>`
      UPDATE vendors SET
        is_open = ${parsed.data.isOpen},
        manual_override = ${parsed.data.isOpen ? null : "closed"},
        updated_at = NOW()
      WHERE id = ${vendor.id}
      RETURNING id, business_name, slug, is_open, manual_override
    `;
    const updated = rows[0];
    if (!updated) throw ApiError.notFound("No vendor profile found for this account.");

    return NextResponse.json(
      ok({
        id: updated.id,
        businessName: updated.business_name,
        slug: updated.slug,
        isOpen: updated.is_open,
        manualOverride: updated.manual_override,
      }),
    );
  } catch (error) {
    // Log loudly: a failing toggle leaves the kitchen in the wrong state.
    console.error("[vendors] availability update failed:", {
      message: error instanceof Error ? error.message : String(error),
    });
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
