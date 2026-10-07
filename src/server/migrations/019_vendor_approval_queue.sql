-- Savora Food — admin vendor approval queue
-- Additive only. Stores Dojah BVN/NIN verification results per vendor,
-- the admin action audit trail, and the latest moderation reason on vendors.

-- ──────────────────────────────────────────────
-- Vendor identity verifications (Dojah BVN/NIN)
-- ──────────────────────────────────────────────
-- One row per vendor: the latest Dojah check result. Vendors without a row
-- (or with status NOT_SUBMITTED) have not submitted documents.

CREATE TABLE IF NOT EXISTS vendor_verifications (
  vendor_id       UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  method          TEXT NOT NULL DEFAULT 'BVN' CHECK (method IN ('BVN', 'NIN')),
  status          TEXT NOT NULL DEFAULT 'NOT_SUBMITTED'
    CHECK (status IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'FAILED')),
  failure_reason  TEXT,
  dojah_reference TEXT,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_verifications_status
  ON vendor_verifications (status);

-- ──────────────────────────────────────────────
-- Admin action audit log (vendor moderation)
-- ──────────────────────────────────────────────
-- One row per approve / reject / suspend / reactivate / manual override.

CREATE TABLE IF NOT EXISTS admin_actions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  vendor_id  UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  action     TEXT NOT NULL
    CHECK (action IN ('APPROVED', 'REJECTED', 'SUSPENDED', 'REACTIVATED', 'OVERRIDDEN')),
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_vendor
  ON admin_actions (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin
  ON admin_actions (admin_id, created_at DESC);

-- ──────────────────────────────────────────────
-- Latest moderation reason on the vendor row
-- ──────────────────────────────────────────────

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
