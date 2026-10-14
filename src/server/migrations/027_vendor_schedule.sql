-- Savora Food — vendor availability schedule
-- Additive only. Weekly opening hours + date exceptions (closures /
-- special hours) per vendor, plus a manual override flag. Availability is
-- COMPUTED on each request (no cron): see src/server/availability.ts.
-- Vendors with no schedule rows are treated as always open.

-- Manual override switch: NULL = follow schedule, 'closed' = forced closed,
-- 'open' = forced open. The legacy vendors.is_open toggle is kept and
-- interpreted as a closed-override when FALSE (see availability.ts).
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS manual_override TEXT NULL
  CHECK (manual_override IN ('open', 'closed'));

-- One row per vendor per weekday (0 = Sunday … 6 = Saturday).
CREATE TABLE IF NOT EXISTS vendor_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slots       JSONB NOT NULL DEFAULT '[]',
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS vendor_schedule_exceptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('closed', 'special_hours')),
  slots       JSONB NULL,
  note        TEXT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_vendor_schedules_vendor
  ON vendor_schedules (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_exceptions_vendor_dates
  ON vendor_schedule_exceptions (vendor_id, start_date, end_date);
