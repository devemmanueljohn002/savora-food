"use client";

import { useMemo, useState } from "react";
import { VendorShell, VendorSignIn } from "@/components/VendorShell";
import RoleGuard from "@/components/RoleGuard";
import {
  useCreateScheduleException,
  useDeleteScheduleException,
  useSaveVendorSchedule,
  useUpdateVendorAvailability,
  useVendorProfile,
  useVendorSchedule,
} from "@/lib/api/hooks";
import { describeAvailability, formatDateRange, weekdayName } from "@/lib/lagos-time";
import type { DaySchedule, ScheduleSlot } from "@/lib/savora-api";

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_SLOT: ScheduleSlot = { open: "08:00", close: "20:00" };
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Client-side mirror of the server rules for instant inline errors. */
function validateDay(slots: ScheduleSlot[]): string | null {
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (!TIME_RE.test(slot.open) || !TIME_RE.test(slot.close)) {
      return `Slot ${i + 1}: use times like 08:00.`;
    }
    if (toMinutes(slot.close) <= toMinutes(slot.open)) {
      return `Slot ${i + 1}: closing time must be after opening time.`;
    }
  }
  const sorted = [...slots].sort((a, b) => toMinutes(a.open) - toMinutes(b.open));
  for (let i = 1; i < sorted.length; i += 1) {
    if (toMinutes(sorted[i].open) < toMinutes(sorted[i - 1].close)) {
      return "Time slots overlap. Each slot must start after the previous one ends.";
    }
  }
  return null;
}

function StatusBanner({ isOpen, nextChange, manualOverride }: { isOpen: boolean; nextChange: string | null; manualOverride: "open" | "closed" | null }) {
  const update = useUpdateVendorAvailability();
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    try {
      await update.mutateAsync({ isOpen: !isOpen });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change your status. Try again.");
    }
  }

  return (
    <div className="card card-body" role="status" aria-live="polite">
      <div className="row">
        <div>
          <span className={`badge ${isOpen ? "badge-success" : "badge-danger"}`}>
            {describeAvailability(isOpen, nextChange)}
          </span>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            {manualOverride === "closed"
              ? "You closed the kitchen manually — the schedule is paused until you reopen."
              : isOpen
                ? "Customers can order from you right now."
                : "Customers see a Closed badge and cannot order until you open."}
          </p>
        </div>
        <button className="btn" type="button" disabled={update.isPending} onClick={toggle}>
          {update.isPending ? "Updating…" : isOpen ? "Close kitchen" : "Reopen"}
        </button>
      </div>
      {error && (
        <p className="auth-error" role="alert" style={{ marginBottom: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function DayRow({
  day,
  onChange,
  onCopyToAll,
  error,
}: {
  day: DaySchedule;
  onChange: (day: DaySchedule) => void;
  onCopyToAll: () => void;
  error: string | null;
}) {
  function setSlot(index: number, patch: Partial<ScheduleSlot>) {
    onChange({ ...day, slots: day.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)) });
  }

  return (
    <div className="sched-day">
      <div className="sched-day-head">
        <label className="sched-toggle">
          <input
            type="checkbox"
            checked={day.enabled}
            onChange={(event) => onChange({ ...day, enabled: event.target.checked })}
          />
          <span>{weekdayName(day.dayOfWeek)}</span>
        </label>
        <button className="btn secondary btn-sm" type="button" onClick={onCopyToAll} title="Copy this day's hours to every day">
          Copy to all days
        </button>
      </div>
      {day.enabled ? (
        <div className="sched-slots">
          {day.slots.map((slot, index) => (
            <div className="sched-slot" key={index}>
              <label>
                Opens
                <input type="time" value={slot.open} onChange={(event) => setSlot(index, { open: event.target.value })} />
              </label>
              <label>
                Closes
                <input type="time" value={slot.close} onChange={(event) => setSlot(index, { close: event.target.value })} />
              </label>
              <button
                className="btn secondary btn-sm"
                type="button"
                aria-label={`Remove slot ${index + 1} on ${weekdayName(day.dayOfWeek)}`}
                onClick={() => onChange({ ...day, slots: day.slots.filter((_, i) => i !== index) })}
              >
                ✕
              </button>
            </div>
          ))}
          {day.slots.length < 4 ? (
            <button
              className="btn secondary btn-sm"
              type="button"
              onClick={() => onChange({ ...day, slots: [...day.slots, { ...DEFAULT_SLOT }] })}
            >
              + Add slot
            </button>
          ) : null}
        </div>
      ) : (
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Closed this day.
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert" style={{ margin: "8px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Exceptions({ vendorTzToday }: { vendorTzToday: string }) {
  const schedule = useVendorSchedule();
  const create = useCreateScheduleException();
  const remove = useDeleteScheduleException();
  const [startDate, setStartDate] = useState(vendorTzToday);
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<"closed" | "special_hours">("closed");
  const [slots, setSlots] = useState<ScheduleSlot[]>([{ ...DEFAULT_SLOT }]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (type === "special_hours") {
      const slotError = validateDay(slots);
      if (slotError) {
        setError(slotError);
        return;
      }
    }
    try {
      await create.mutateAsync({
        startDate,
        ...(endDate ? { endDate } : {}),
        type,
        ...(type === "special_hours" ? { slots } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setEndDate("");
      setNote("");
      setSlots([{ ...DEFAULT_SLOT }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this closure.");
    }
  }

  async function destroy(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId(null);
    try {
      await remove.mutateAsync(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this closure.");
    }
  }

  const exceptions = schedule.data?.exceptions ?? [];

  return (
    <section>
      <h2>Closures & special hours</h2>
      <p className="muted">Public holidays, breaks, or one-off late openings. Closures beat your weekly hours.</p>      <form className="card card-body" onSubmit={submit}>
        <div className="sched-grid-2">
          <label>
            From
            <input type="date" value={startDate} min={vendorTzToday} onChange={(event) => setStartDate(event.target.value)} required />
          </label>
          <label>
            To (optional)
            <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <div className="sched-grid-2">
          <label>
            Type
            <select value={type} onChange={(event) => setType(event.target.value as "closed" | "special_hours")}>
              <option value="closed">Closed</option>
              <option value="special_hours">Special hours</option>
            </select>
          </label>
          <label>
            Note (optional)
            <input type="text" value={note} maxLength={280} placeholder="e.g. Christmas break" onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        {type === "special_hours" ? (
          <div className="sched-slots">
            {slots.map((slot, index) => (
              <div className="sched-slot" key={index}>
                <label>
                  Opens
                  <input
                    type="time"
                    value={slot.open}
                    onChange={(event) => setSlots(slots.map((s, i) => (i === index ? { ...s, open: event.target.value } : s)))}
                  />
                </label>
                <label>
                  Closes
                  <input
                    type="time"
                    value={slot.close}
                    onChange={(event) => setSlots(slots.map((s, i) => (i === index ? { ...s, close: event.target.value } : s)))}
                  />
                </label>
                {slots.length > 1 ? (
                  <button
                    className="btn secondary btn-sm"
                    type="button"
                    aria-label={`Remove special-hours slot ${index + 1}`}
                    onClick={() => setSlots(slots.filter((_, i) => i !== index))}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
            {slots.length < 4 ? (
              <button className="btn secondary btn-sm" type="button" onClick={() => setSlots([...slots, { ...DEFAULT_SLOT }])}>
                + Add slot
              </button>
            ) : null}
          </div>
        ) : null}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add closure"}
        </button>
      </form>

      <div style={{ marginTop: 16 }}>
        {exceptions.length === 0 ? (
          <p className="muted">No closures added yet.</p>
        ) : (
          <ul className="sched-exceptions">
            {exceptions.map((exception) => (
              <li className="card card-body sched-exception" key={exception.id}>
                <div>
                  <strong>{formatDateRange(exception.startDate, exception.endDate)}</strong>{" "}
                  <span className={`badge ${exception.type === "closed" ? "badge-danger" : "badge-warning"}`}>
                    {exception.type === "closed" ? "Closed" : "Special hours"}
                  </span>{" "}
                  {exception.endDate < vendorTzToday ? <span className="badge">Past</span> : null}
                  {exception.type === "special_hours" && exception.slots ? (
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {exception.slots.map((slot) => `${slot.open}–${slot.close}`).join(", ")}
                    </p>
                  ) : null}
                  {exception.note ? (
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {exception.note}
                    </p>
                  ) : null}
                </div>
                <button
                  className={`btn btn-sm ${confirmId === exception.id ? "danger" : "secondary"}`}
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => destroy(exception.id)}
                >
                  {confirmId === exception.id ? "Confirm delete" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function VendorSchedulePage() {
  const profile = useVendorProfile();
  const schedule = useVendorSchedule();
  const save = useSaveVendorSchedule();
  const [override, setOverride] = useState<DaySchedule[] | null>(null);
  const [dayErrors, setDayErrors] = useState<Record<number, string>>({});
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const serverDays = schedule.data?.days;
  // Fresh vendors (no saved schedule) start from sensible 08:00–20:00 days
  // so saving without edits can never accidentally close the kitchen.
  const days = useMemo<DaySchedule[] | null>(() => {
    if (override) return override;
    if (!serverDays) return null;
    const hasSlots = serverDays.some((day) => day.slots.length > 0);
    return serverDays.map((day) => ({
      ...day,
      slots: day.slots.length > 0 || hasSlots ? day.slots : [{ ...DEFAULT_SLOT }],
    }));
  }, [override, serverDays]);

  if (profile.isLoading || schedule.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading your schedule…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) return <VendorSignIn />;
  if (schedule.isError || !schedule.data) {
    return (
      <VendorShell profile={profile.data} title="Schedule" sub="Opening hours, closures and special hours.">
        <p className="auth-error" role="alert">
          Could not load your schedule.{" "}
          <button className="btn secondary btn-sm" type="button" onClick={() => void schedule.refetch()}>
            Try again
          </button>
        </p>
      </VendorShell>
    );
  }

  const state = schedule.data;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  function updateDay(next: DaySchedule) {
    setOverride((days ?? []).map((day) => (day.dayOfWeek === next.dayOfWeek ? next : day)));
    setDayErrors((prev) => {
      const { [next.dayOfWeek]: _dropped, ...rest } = prev;
      return rest;
    });
    setSaved(false);
  }

  function copyToAll(source: DaySchedule) {
    setOverride(
      (days ?? []).map((day) =>
        day.dayOfWeek === source.dayOfWeek ? day : { ...day, enabled: source.enabled, slots: source.slots.map((s) => ({ ...s })) },
      ),
    );
    setDayErrors({});
    setSaved(false);
  }

  async function saveAll() {
    setSaveError("");
    setSaved(false);
    const current = days ?? [];
    const errors: Record<number, string> = {};
    for (const day of current) {
      if (!day.enabled) continue;
      const message = validateDay(day.slots);
      if (message) errors[day.dayOfWeek] = message;
    }
    setDayErrors(errors);
    if (Object.keys(errors).length > 0 || current.length !== 7) {
      if (current.length !== 7) setSaveError("Schedule must include all 7 days.");
      return;
    }
    try {
      // onSuccess refreshes the schedule query; clearing the local override
      // lets the editor derive from the saved server state.
      await save.mutateAsync(current);
      setOverride(null);
      setSaved(true);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Could not save your hours.");
    }
  }

  return (
    <RoleGuard allow={["VENDOR", "ADMIN"]}>
      <VendorShell profile={profile.data} title="Schedule" sub="Opening hours, closures and special hours. Customers can only order while you are open.">
        <StatusBanner isOpen={state.isOpen} nextChange={state.nextChange} manualOverride={state.manualOverride} />
        {!state.hasSchedule ? (
          <p className="auth-success" role="note">
            No hours saved yet — you are open around the clock. Edit below and save to set weekly hours.
          </p>
        ) : null}

        <section style={{ marginTop: 24 }}>
          <h2>Weekly hours</h2>
          <p className="muted">Times are in Lagos time (WAT). Days with no slots stay closed.</p>
          <div className="sched-week">
            {DISPLAY_ORDER.map((dayOfWeek) => {
              const day = (days ?? []).find((d) => d.dayOfWeek === dayOfWeek);
              if (!day) return null;
              return (
                <DayRow
                  key={dayOfWeek}
                  day={day}
                  onChange={updateDay}
                  onCopyToAll={() => copyToAll(day)}
                  error={dayErrors[dayOfWeek] ?? null}
                />
              );
            })}
          </div>
          {saveError && (
            <p className="auth-error" role="alert">
              {saveError}
            </p>
          )}
          {saved && (
            <p className="auth-success" role="status">
              Hours saved. Customers now see your updated availability.
            </p>
          )}
          <button className="btn" type="button" disabled={save.isPending} onClick={saveAll}>
            {save.isPending ? "Saving…" : "Save hours"}
          </button>
        </section>

        <div style={{ marginTop: 32 }}>
          <Exceptions vendorTzToday={today} />
        </div>
      </VendorShell>
    </RoleGuard>
  );
}
