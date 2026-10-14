import { db } from "./db";
import { ApiError } from "./errors";

/**
 * Vendor availability schedule — computed on EVERY request, never stored,
 * never cron-driven.
 *
 * Priority: manual override > date exception > weekly schedule > default.
 * Vendors with no schedule rows and no exceptions are always open.
 * All wall-clock math happens in Africa/Lagos (WAT = UTC+1, no DST ever, so
 * a fixed offset is exact).
 */

export const LAGOS_TZ = "Africa/Lagos";
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_DAYS = 7;

export type ScheduleSlot = { open: string; close: string };
export type DaySchedule = { dayOfWeek: number; slots: ScheduleSlot[]; enabled: boolean };
export type ExceptionType = "closed" | "special_hours";
export type ScheduleException = {
  id: string;
  startDate: string; // YYYY-MM-DD (Lagos calendar date)
  endDate: string; // YYYY-MM-DD (Lagos calendar date)
  type: ExceptionType;
  slots: ScheduleSlot[] | null;
  note: string | null;
};
export type ManualOverride = "open" | "closed" | null;
export type AvailabilityReason = "manual" | "exception" | "schedule" | "default";
export type Availability = {
  isOpen: boolean;
  /** UTC ISO timestamp of the next open<->closed flip, or null when unknown/never. */
  nextChange: string | null;
  reason: AvailabilityReason;
};

export type AvailabilityInput = {
  manualOverride: ManualOverride;
  /** Legacy vendors.is_open flag: FALSE counts as a manual closed-override. */
  legacyOpen: boolean;
  schedules: DaySchedule[];
  exceptions: ScheduleException[];
};

// ── Lagos wall clock ────────────────────────────────────────────────────────

type LagosParts = { weekday: number; minutes: number; ymd: string };

function lagosParts(date: Date): LagosParts {
  const shifted = new Date(date.getTime() + LAGOS_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    weekday: shifted.getUTCDay(), // 0 = Sunday … 6 = Saturday
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    ymd: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
  };
}

/** UTC ISO instant for a Lagos calendar date + minutes-since-midnight. */
function lagosIso(ymd: string, minutes: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - LAGOS_OFFSET_MS + minutes * 60_000).toISOString();
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const shifted = Date.UTC(y, m - 1, d) + days * DAY_MS;
  return new Date(shifted).toISOString().slice(0, 10);
}

function weekdayOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  // Noon UTC is safely inside the Lagos calendar day for any offset ±12h.
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

// ── Validation (shared by routes; unit-tested) ─────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function timeToMinutes(value: string): number | null {
  const match = TIME_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateSlots(raw: unknown): ScheduleSlot[] {
  if (!Array.isArray(raw)) throw ApiError.validation("Slots must be a list of {open, close} times.");
  if (raw.length > 4) throw ApiError.validation("A day can have at most 4 time slots.");
  const slots: ScheduleSlot[] = raw.map((slot, index) => {
    const open = typeof slot === "object" && slot !== null ? (slot as Record<string, unknown>).open : undefined;
    const close = typeof slot === "object" && slot !== null ? (slot as Record<string, unknown>).close : undefined;
    if (typeof open !== "string" || !TIME_RE.test(open)) {
      throw ApiError.validation(`Slot ${index + 1}: open must be a time like "08:00".`);
    }
    if (typeof close !== "string" || !TIME_RE.test(close)) {
      throw ApiError.validation(`Slot ${index + 1}: close must be a time like "20:00".`);
    }
    const openMin = timeToMinutes(open) as number;
    const closeMin = timeToMinutes(close) as number;
    if (closeMin <= openMin) {
      throw ApiError.validation(`Slot ${index + 1}: closing time must be after opening time.`);
    }
    return { open, close };
  });
  const sorted = [...slots].sort((a, b) => (timeToMinutes(a.open) as number) - (timeToMinutes(b.open) as number));
  for (let i = 1; i < sorted.length; i += 1) {
    if ((timeToMinutes(sorted[i].open) as number) < (timeToMinutes(sorted[i - 1].close) as number)) {
      throw ApiError.validation("Time slots overlap. Adjust them so each slot starts after the previous one ends.");
    }
  }
  return sorted;
}

export function validateDaySchedules(raw: unknown): DaySchedule[] {
  if (!Array.isArray(raw) || raw.length !== 7) {
    throw ApiError.validation("Schedule must include all 7 days (dayOfWeek 0–6).");
  }
  const seen = new Set<number>();
  const days: DaySchedule[] = raw.map((row) => {
    const record = (row ?? {}) as Record<string, unknown>;
    const dayOfWeek = typeof record.dayOfWeek === "number" ? record.dayOfWeek : Number.NaN;
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw ApiError.validation("Each day needs dayOfWeek 0 (Sunday) to 6 (Saturday).");
    }
    if (seen.has(dayOfWeek)) throw ApiError.validation("Each weekday may only appear once.");
    seen.add(dayOfWeek);
    return {
      dayOfWeek,
      enabled: record.enabled !== false,
      slots: validateSlots(record.slots ?? []),
    };
  });
  return days.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

export type ExceptionInput = {
  startDate: unknown;
  endDate?: unknown;
  type: unknown;
  slots?: unknown;
  note?: unknown;
};

export function validateExceptionInput(raw: ExceptionInput): {
  startDate: string;
  endDate: string;
  type: ExceptionType;
  slots: ScheduleSlot[] | null;
  note: string | null;
} {
  const startDate = typeof raw.startDate === "string" ? raw.startDate.trim() : "";
  const endDateRaw = typeof raw.endDate === "string" && raw.endDate.trim() ? raw.endDate.trim() : startDate;
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDateRaw)) {
    throw ApiError.validation("Closure dates must be valid calendar dates (YYYY-MM-DD).");
  }
  if (endDateRaw < startDate) {
    throw ApiError.validation("The end date cannot be before the start date.");
  }
  if (raw.type !== "closed" && raw.type !== "special_hours") {
    throw ApiError.validation('Type must be "closed" or "special_hours".');
  }
  let slots: ScheduleSlot[] | null = null;
  if (raw.type === "special_hours") {
    const parsed = validateSlots(raw.slots ?? []);
    if (parsed.length === 0) {
      throw ApiError.validation("Special hours need at least one time slot.");
    }
    slots = parsed;
  }
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 280) : null;
  return { startDate, endDate: endDateRaw, type: raw.type, slots, note };
}

// ── Core computation (pure; unit-tested) ────────────────────────────────────

function slotsForDate(
  ymd: string,
  schedules: DaySchedule[],
  exceptions: ScheduleException[],
): { slots: ScheduleSlot[]; fromException: boolean } {
  const covering = exceptions.filter((e) => e.startDate <= ymd && ymd <= e.endDate);
  if (covering.some((e) => e.type === "closed")) return { slots: [], fromException: true };
  const special = covering.find((e) => e.type === "special_hours");
  if (special) return { slots: special.slots ?? [], fromException: true };
  const row = schedules.find((s) => s.dayOfWeek === weekdayOfYmd(ymd));
  if (!row || !row.enabled) return { slots: [], fromException: false };
  return { slots: row.slots, fromException: false };
}

function nextOpeningAfter(
  ymd: string,
  minutes: number,
  todaySlots: ScheduleSlot[],
  schedules: DaySchedule[],
  exceptions: ScheduleException[],
): string | null {
  for (const slot of todaySlots) {
    if ((timeToMinutes(slot.open) as number) > minutes) return lagosIso(ymd, timeToMinutes(slot.open) as number);
  }
  for (let d = 1; d <= SCAN_DAYS; d += 1) {
    const future = addDaysYmd(ymd, d);
    const { slots } = slotsForDate(future, schedules, exceptions);
    if (slots.length > 0) return lagosIso(future, timeToMinutes(slots[0].open) as number);
  }
  return null;
}

/**
 * Single source of truth for "is this kitchen accepting orders right now?".
 * Priority: manual override > date exception > weekly schedule > default
 * (no schedule rows and no exceptions = always open).
 */
export function computeAvailability(input: AvailabilityInput, now: Date = new Date()): Availability {
  if (input.manualOverride === "closed") return { isOpen: false, nextChange: null, reason: "manual" };
  if (input.manualOverride === "open") return { isOpen: true, nextChange: null, reason: "manual" };
  if (!input.legacyOpen) return { isOpen: false, nextChange: null, reason: "manual" };

  const { minutes, ymd } = lagosParts(now);
  const coveringToday = input.exceptions.some((e) => e.startDate <= ymd && ymd <= e.endDate);
  const { slots: todaySlots } = slotsForDate(ymd, input.schedules, input.exceptions);

  if (input.schedules.length === 0 && !coveringToday) {
    return { isOpen: true, nextChange: null, reason: "default" };
  }
  const reason: AvailabilityReason = coveringToday ? "exception" : "schedule";

  for (const slot of todaySlots) {
    const openMin = timeToMinutes(slot.open) as number;
    const closeMin = timeToMinutes(slot.close) as number;
    if (minutes >= openMin && minutes < closeMin) {
      return { isOpen: true, nextChange: lagosIso(ymd, closeMin), reason };
    }
  }
  return {
    isOpen: false,
    nextChange: nextOpeningAfter(ymd, minutes, todaySlots, input.schedules, input.exceptions),
    reason,
  };
}

// ── Database access ─────────────────────────────────────────────────────────

function toYmd(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function toSlots(value: unknown): ScheduleSlot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (s): s is ScheduleSlot =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as ScheduleSlot).open === "string" &&
        typeof (s as ScheduleSlot).close === "string" &&
        timeToMinutes((s as ScheduleSlot).open) !== null &&
        timeToMinutes((s as ScheduleSlot).close) !== null,
    )
    .map((s) => ({ open: s.open, close: s.close }));
}

type ScheduleRow = { day_of_week: number; slots: unknown; enabled: boolean };
type ExceptionRow = {
  id: string;
  start_date: unknown;
  end_date: unknown;
  type: string;
  slots: unknown;
  note: string | null;
};

function mapExceptionRow(row: ExceptionRow): ScheduleException {
  return {
    id: row.id,
    startDate: toYmd(row.start_date),
    endDate: toYmd(row.end_date),
    type: row.type === "special_hours" ? "special_hours" : "closed",
    slots: row.slots == null ? null : toSlots(row.slots),
    note: row.note,
  };
}

export async function getVendorScheduleRows(vendorId: string): Promise<DaySchedule[]> {
  const rows = await db()<ScheduleRow[]>`
    SELECT day_of_week, slots, enabled FROM vendor_schedules
    WHERE vendor_id = ${vendorId} ORDER BY day_of_week ASC
  `;
  return rows.map((row) => ({
    dayOfWeek: row.day_of_week,
    slots: toSlots(row.slots),
    enabled: row.enabled,
  }));
}

export async function replaceVendorSchedule(vendorId: string, days: DaySchedule[]): Promise<DaySchedule[]> {
  const sql = db();
  return sql.begin(async (tx) => {
    await tx`DELETE FROM vendor_schedules WHERE vendor_id = ${vendorId}`;
    for (const day of days) {
      await tx`
        INSERT INTO vendor_schedules (vendor_id, day_of_week, slots, enabled, updated_at)
        VALUES (${vendorId}, ${day.dayOfWeek}, ${sql.json(day.slots)}, ${day.enabled}, NOW())
      `;
    }
    return days;
  });
}

export async function listVendorExceptions(vendorId: string, limit = 100): Promise<ScheduleException[]> {
  const rows = await db()<ExceptionRow[]>`
    SELECT id, start_date, end_date, type, slots, note FROM vendor_schedule_exceptions
    WHERE vendor_id = ${vendorId}
    ORDER BY start_date DESC, end_date DESC
    LIMIT ${limit}
  `;
  return rows.map(mapExceptionRow);
}

export async function createVendorException(
  vendorId: string,
  input: { startDate: string; endDate: string; type: ExceptionType; slots: ScheduleSlot[] | null; note: string | null },
): Promise<ScheduleException> {
  const sql = db();
  const rows = await sql<ExceptionRow[]>`
    INSERT INTO vendor_schedule_exceptions (vendor_id, start_date, end_date, type, slots, note)
    VALUES (${vendorId}, ${input.startDate}, ${input.endDate}, ${input.type}, ${input.slots === null ? null : sql.json(input.slots)}, ${input.note})
    RETURNING id, start_date, end_date, type, slots, note
  `;
  return mapExceptionRow(rows[0]);
}

export async function deleteVendorException(vendorId: string, id: string): Promise<boolean> {
  const removed = await db()`DELETE FROM vendor_schedule_exceptions WHERE id = ${id} AND vendor_id = ${vendorId} RETURNING id`;
  return removed.length > 0;
}

type VendorBitsRow = {
  id: string;
  business_name: string;
  is_open: boolean | null;
  manual_override: string | null;
};

/**
 * Bulk availability for a set of vendors (customer listings, checkout):
 * 3 queries total regardless of vendor count.
 */
export async function getAvailabilityMap(
  vendorIds: string[],
  now: Date = new Date(),
): Promise<Map<string, Availability & { businessName: string }>> {
  const result = new Map<string, Availability & { businessName: string }>();
  if (vendorIds.length === 0) return result;
  const sql = db();
  const today = lagosParts(now).ymd;
  const [vendors, schedules, exceptions] = await Promise.all([
    sql<VendorBitsRow[]>`SELECT id, business_name, is_open, manual_override FROM vendors WHERE id = ANY(${vendorIds})`,
    sql<(ScheduleRow & { vendor_id: string })[]>`
      SELECT vendor_id, day_of_week, slots, enabled FROM vendor_schedules WHERE vendor_id = ANY(${vendorIds})
    `,
    sql<(ExceptionRow & { vendor_id: string })[]>`
      SELECT vendor_id, id, start_date, end_date, type, slots, note FROM vendor_schedule_exceptions
      WHERE vendor_id = ANY(${vendorIds}) AND end_date >= ${today}
      ORDER BY start_date ASC LIMIT 500
    `,
  ]);
  const schedulesByVendor = new Map<string, DaySchedule[]>();
  for (const row of schedules) {
    const list = schedulesByVendor.get(row.vendor_id) ?? [];
    list.push({ dayOfWeek: row.day_of_week, slots: toSlots(row.slots), enabled: row.enabled });
    schedulesByVendor.set(row.vendor_id, list);
  }
  const exceptionsByVendor = new Map<string, ScheduleException[]>();
  for (const row of exceptions) {
    const list = exceptionsByVendor.get(row.vendor_id) ?? [];
    list.push(mapExceptionRow(row));
    exceptionsByVendor.set(row.vendor_id, list);
  }
  for (const vendor of vendors) {
    const override: ManualOverride =
      vendor.manual_override === "closed" ? "closed" : vendor.manual_override === "open" ? "open" : null;
    const availability = computeAvailability(
      {
        manualOverride: override,
        legacyOpen: vendor.is_open ?? true,
        schedules: schedulesByVendor.get(vendor.id) ?? [],
        exceptions: exceptionsByVendor.get(vendor.id) ?? [],
      },
      now,
    );
    result.set(vendor.id, { ...availability, businessName: vendor.business_name });
  }
  return result;
}

export async function assertVendorsAccepting(vendorIds: string[], now: Date = new Date()): Promise<void> {
  if (vendorIds.length === 0) return;
  const map = await getAvailabilityMap(vendorIds, now);
  for (const vendorId of vendorIds) {
    const entry = map.get(vendorId);
    if (!entry || !entry.isOpen) {
      throw ApiError.vendorClosed(entry?.businessName);
    }
  }
}
