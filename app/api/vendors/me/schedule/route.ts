import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorByUserId } from "@/server/auth/store";
import {
  computeAvailability,
  getVendorScheduleRows,
  listVendorExceptions,
  replaceVendorSchedule,
  validateDaySchedules,
  type DaySchedule,
  type ManualOverride,
} from "@/server/availability";

const putSchema = z.object({ days: z.array(z.unknown()).min(1).max(7) });

function blankWeek(): DaySchedule[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, slots: [], enabled: true }));
}

async function scheduleState(vendorId: string) {
  const [vendor, rows, exceptions] = await Promise.all([
    getVendorByUserId(vendorId).then((v) => {
      if (!v) throw ApiError.notFound("No vendor profile found for this account.");
      return v;
    }),
    getVendorScheduleRows(vendorId),
    listVendorExceptions(vendorId),
  ]);
  const override: ManualOverride =
    vendor.manual_override === "closed" ? "closed" : vendor.manual_override === "open" ? "open" : null;
  const effective = computeAvailability({
    manualOverride: override,
    legacyOpen: vendor.is_open ?? true,
    schedules: rows,
    exceptions,
  });
  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));
  const days = blankWeek().map((blank) => byDay.get(blank.dayOfWeek) ?? blank);
  return {
    manualOverride: override,
    isOpen: effective.isOpen,
    nextChange: effective.nextChange,
    reason: effective.reason,
    hasSchedule: rows.length > 0,
    days,
    exceptions,
  };
}

/**
 * GET /vendors/me/schedule — vendor-only. Weekly hours, exceptions, and the
 * live computed status (same computeAvailability customers are gated on).
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await requireVendor(_request);
    return NextResponse.json(ok(await scheduleState(session.id)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

/**
 * PUT /vendors/me/schedule — vendor-only. Replaces all 7 weekday rows.
 * Validated: close after open, no overlapping slots.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorByUserId(session.id);
    if (!vendor) throw ApiError.notFound("No vendor profile found for this account.");
    const parsed = putSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Schedule must include all 7 days (dayOfWeek 0–6).");
    }
    const days = validateDaySchedules(parsed.data.days);
    await replaceVendorSchedule(vendor.id, days);
    return NextResponse.json(ok(await scheduleState(session.id)));
  } catch (error) {
    console.error("[vendors] schedule save failed:", {
      message: error instanceof Error ? error.message : String(error),
    });
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
