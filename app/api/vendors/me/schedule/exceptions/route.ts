import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorByUserId } from "@/server/auth/store";
import { createVendorException, validateExceptionInput } from "@/server/availability";

/**
 * POST /vendors/me/schedule/exceptions — vendor-only. Adds a closure
 * (single day or date range) or special-hours day. Validated: end date not
 * before start date; special hours need non-overlapping slots.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorByUserId(session.id);
    if (!vendor) throw ApiError.notFound("No vendor profile found for this account.");
    const body = (await request.json().catch(() => null)) as {
      startDate?: unknown;
      endDate?: unknown;
      type?: unknown;
      slots?: unknown;
      note?: unknown;
    } | null;
    const input = validateExceptionInput({
      startDate: body?.startDate,
      endDate: body?.endDate,
      type: body?.type,
      slots: body?.slots,
      note: body?.note,
    });
    const exception = await createVendorException(vendor.id, input);
    return NextResponse.json(ok(exception), { status: 201 });
  } catch (error) {
    console.error("[vendors] exception save failed:", {
      message: error instanceof Error ? error.message : String(error),
    });
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
