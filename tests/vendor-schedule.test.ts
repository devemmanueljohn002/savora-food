import { describe, expect, it } from "vitest";
import {
  computeAvailability,
  validateDaySchedules,
  validateExceptionInput,
  validateSlots,
  type AvailabilityInput,
} from "@/server/availability";
import { describeAvailability, formatDateRange, formatLagosTime } from "@/lib/lagos-time";

/** Build a UTC Date from an Africa/Lagos wall-clock reading (WAT = UTC+1). */
function lagos(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 60 * 60 * 1000);
}

// 2026-10-12 is a Monday.
const MON_10AM = lagos(2026, 10, 12, 10);
const MON_9PM = lagos(2026, 10, 12, 21);

function base(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return { manualOverride: null, legacyOpen: true, schedules: [], exceptions: [], ...overrides };
}

const monTue = [
  { dayOfWeek: 1, enabled: true, slots: [{ open: "08:00", close: "20:00" }] },
  { dayOfWeek: 2, enabled: true, slots: [{ open: "08:00", close: "20:00" }] },
];

describe("computeAvailability", () => {
  it("treats vendors with no schedule as always open", () => {
    expect(computeAvailability(base(), MON_10AM)).toEqual({ isOpen: true, nextChange: null, reason: "default" });
    expect(computeAvailability(base(), MON_9PM)).toEqual({ isOpen: true, nextChange: null, reason: "default" });
  });

  it("opens inside a weekly slot and reports closing time", () => {
    const result = computeAvailability(base({ schedules: monTue }), MON_10AM);
    expect(result.isOpen).toBe(true);
    expect(result.reason).toBe("schedule");
    // 20:00 Lagos = 19:00Z.
    expect(result.nextChange).toBe("2026-10-12T19:00:00.000Z");
  });

  it("closes outside weekly slots and reports the next opening", () => {
    const result = computeAvailability(base({ schedules: monTue }), MON_9PM);
    expect(result.isOpen).toBe(false);
    expect(result.reason).toBe("schedule");
    // Tuesday 08:00 Lagos = 07:00Z.
    expect(result.nextChange).toBe("2026-10-13T07:00:00.000Z");
  });

  it("treats a fully disabled week as closed with no next change", () => {
    const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, enabled: false, slots: [] }));
    const result = computeAvailability(base({ schedules: days }), MON_10AM);
    expect(result).toEqual({ isOpen: false, nextChange: null, reason: "schedule" });
  });

  it("lets a closed exception beat the weekly schedule", () => {
    const result = computeAvailability(
      base({
        schedules: monTue,
        exceptions: [{ id: "e1", startDate: "2026-10-12", endDate: "2026-10-12", type: "closed", slots: null, note: "Holiday" }],
      }),
      MON_10AM,
    );
    expect(result.isOpen).toBe(false);
    expect(result.reason).toBe("exception");
  });

  it("lets special hours beat the weekly schedule", () => {
    const input = base({
      schedules: monTue,
      exceptions: [
        { id: "e1", startDate: "2026-10-12", endDate: "2026-10-12", type: "special_hours", slots: [{ open: "12:00", close: "14:00" }], note: null },
      ],
    });
    expect(computeAvailability(input, MON_10AM).isOpen).toBe(false);
    const lunch = computeAvailability(input, lagos(2026, 10, 12, 13));
    expect(lunch.isOpen).toBe(true);
    expect(lunch.reason).toBe("exception");
    expect(lunch.nextChange).toBe("2026-10-12T13:00:00.000Z");
  });

  it("lets the manual override beat everything", () => {
    const closed = base({
      manualOverride: "closed",
      schedules: monTue,
      exceptions: [{ id: "e1", startDate: "2026-10-12", endDate: "2026-10-12", type: "special_hours", slots: [{ open: "09:00", close: "18:00" }], note: null }],
    });
    expect(computeAvailability(closed, MON_10AM)).toEqual({ isOpen: false, nextChange: null, reason: "manual" });

    const legacyClosed = base({ manualOverride: null, legacyOpen: false, schedules: monTue });
    expect(computeAvailability(legacyClosed, MON_10AM)).toEqual({ isOpen: false, nextChange: null, reason: "manual" });

    const forced = base({ manualOverride: "open", schedules: [] });
    expect(computeAvailability(forced, MON_9PM)).toEqual({ isOpen: true, nextChange: null, reason: "manual" });
  });

  it("supports multiple slots per day", () => {
    const schedules = [{ dayOfWeek: 1, enabled: true, slots: [{ open: "08:00", close: "12:00" }, { open: "16:00", close: "22:00" }] }];
    const midday = computeAvailability(base({ schedules }), lagos(2026, 10, 12, 13));
    expect(midday.isOpen).toBe(false);
    expect(midday.nextChange).toBe("2026-10-12T15:00:00.000Z");
    const evening = computeAvailability(base({ schedules }), lagos(2026, 10, 12, 17));
    expect(evening.isOpen).toBe(true);
    expect(evening.nextChange).toBe("2026-10-12T21:00:00.000Z");
  });
});

describe("schedule validation", () => {
  it("rejects closing before opening", () => {
    expect(() => validateSlots([{ open: "20:00", close: "08:00" }])).toThrowError("after opening");
    expect(() => validateSlots([{ open: "08:00", close: "08:00" }])).toThrowError("after opening");
  });

  it("rejects overlapping slots", () => {
    expect(() => validateSlots([{ open: "08:00", close: "12:00" }, { open: "11:00", close: "14:00" }])).toThrowError("overlap");
  });

  it("accepts back-to-back slots", () => {
    expect(validateSlots([{ open: "08:00", close: "12:00" }, { open: "12:00", close: "20:00" }])).toHaveLength(2);
  });

  it("rejects malformed times", () => {
    expect(() => validateSlots([{ open: "8am", close: "20:00" }])).toThrowError("open must be a time");
    expect(() => validateSlots([{ open: "08:00", close: "25:00" }])).toThrowError("close must be a time");
  });

  it("requires all 7 weekdays exactly once", () => {
    expect(() => validateDaySchedules([{ dayOfWeek: 1, enabled: true, slots: [] }])).toThrowError("all 7 days");
    const dup = Array.from({ length: 7 }, () => ({ dayOfWeek: 1, enabled: true, slots: [] }));
    expect(() => validateDaySchedules(dup)).toThrowError("only appear once");
  });

  it("rejects exceptions ending before they start", () => {
    expect(() => validateExceptionInput({ startDate: "2026-12-25", endDate: "2026-12-24", type: "closed" })).toThrowError(
      "before the start date",
    );
  });

  it("requires slots for special hours", () => {
    expect(() => validateExceptionInput({ startDate: "2026-12-25", type: "special_hours", slots: [] })).toThrowError(
      "at least one time slot",
    );
  });

  it("accepts a single-day closure without an end date", () => {
    const parsed = validateExceptionInput({ startDate: "2026-12-25", type: "closed", note: "Christmas" });
    expect(parsed).toMatchObject({ startDate: "2026-12-25", endDate: "2026-12-25", type: "closed" });
  });
});

describe("lagos-time copy", () => {
  it("formats UTC instants as Lagos time", () => {
    // 19:00Z = 20:00 Lagos.
    expect(formatLagosTime("2026-10-12T19:00:00.000Z")).toBe("8:00 PM");
  });

  it("describes open/closed states with the next change", () => {
    const now = lagos(2026, 10, 12, 10); // Monday 10:00 Lagos.
    expect(describeAvailability(true, "2026-10-12T19:00:00.000Z", now)).toBe("Open now · closes 8:00 PM");
    expect(describeAvailability(false, "2026-10-12T07:00:00.000Z", now)).toBe("Closed · opens 8:00 AM");
    expect(describeAvailability(false, "2026-10-13T07:00:00.000Z", now)).toBe("Closed · opens tomorrow 8:00 AM");
    expect(describeAvailability(false, "2026-10-15T07:00:00.000Z", now)).toBe("Closed · opens Thu 8:00 AM");
    expect(describeAvailability(true, null, now)).toBe("Open now");
    expect(describeAvailability(false, null, now)).toBe("Closed");
  });

  it("formats exception date ranges", () => {
    expect(formatDateRange("2026-12-25", "2026-12-25")).toBe("Dec 25");
    expect(formatDateRange("2026-12-25", "2026-12-27")).toBe("Dec 25 – Dec 27");
  });
});
