import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorByUserId } from "@/server/auth/store";
import { deleteVendorException } from "@/server/availability";

/**
 * DELETE /vendors/me/schedule/exceptions/[id] — vendor-only. Removes one of
 * the vendor's own closures / special-hours days.
 */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireVendor(_request);
    const vendor = await getVendorByUserId(session.id);
    if (!vendor) throw ApiError.notFound("No vendor profile found for this account.");
    const { id } = await ctx.params;
    const deleted = await deleteVendorException(vendor.id, id);
    if (!deleted) throw ApiError.notFound("That closure was not found.");
    return NextResponse.json(ok({ deleted: true }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
