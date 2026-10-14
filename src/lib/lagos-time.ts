/**
 * Africa/Lagos wall-clock formatting for availability copy.
 * All timestamps from the API are UTC ISO; vendors and customers read them
 * as Lagos time ("8:00 PM", "tomorrow 8:00 AM").
 */

export const LAGOS_TZ = "Africa/Lagos";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: LAGOS_TZ,
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

function lagosParts(date: Date): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts;
}

/** "8:00 PM" in Lagos time (built manually so ICU builds can't change it). */
export function formatLagosTime(iso: string): string {
  const parts = lagosParts(new Date(iso));
  const hour24 = Number(parts.hour);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${parts.minute.padStart(2, "0")} ${period}`;
}

function lagosYmd(date: Date): string {
  const parts = lagosParts(date);
  return `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Live status line for the vendor banner and customer badges:
 * "Open now · closes 8:00 PM", "Closed · opens 8:00 AM",
 * "Closed · opens tomorrow 8:00 AM", "Closed · opens Mon 8:00 AM",
 * or plain "Open now" / "Closed" when no next change is known.
 */
export function describeAvailability(isOpen: boolean, nextChange: string | null, now: Date = new Date()): string {
  if (!nextChange) return isOpen ? "Open now" : "Closed";
  const time = formatLagosTime(nextChange);
  if (isOpen) return `Open now · closes ${time}`;
  const target = lagosYmd(new Date(nextChange));
  if (target === lagosYmd(now)) return `Closed · opens ${time}`;
  if (target === lagosYmd(addDays(now, 1))) return `Closed · opens tomorrow ${time}`;
  // Noon UTC always falls inside the Lagos calendar day for any real offset.
  const weekday = new Date(`${target}T12:00:00Z`).getUTCDay();
  return `Closed · opens ${WEEKDAYS[weekday]} ${time}`;
}

/** Short weekday name for dayOfWeek 0 (Sunday) – 6 (Saturday). */
export function weekdayName(dayOfWeek: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek] ?? "";
}

/** "Dec 25" / "Dec 25 – Dec 27" for exception rows. */
export function formatDateRange(startDate: string, endDate: string): string {
  // Parse as UTC noon so the Lagos calendar date always matches the stored date.
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const label = (date: Date) => `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  if (startDate === endDate) return label(start);
  return `${label(start)} – ${label(end)}`;
}
