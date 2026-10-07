-- Savora Food — Phase 2 affiliate marketers
-- Additive only. Extends 021_withdrawal_phase1.sql.
--
-- * affiliates: one profile per user (any signed-in role), unique referral
--   code, bank/recipient columns mirroring vendors + delivery_partners so the
--   shared payout service works unchanged (OWNER_TABLES gains AFFILIATE).
-- * affiliate_clicks: raw referral-link hits (powers total-clicks + conversion).
-- * affiliate_commissions: exactly ONE row per order (UNIQUE order_id) —
--   PENDING until the order is delivered, RELEASED into the ledger on
--   maturity, REVERSED with an offsetting entry on cancel/refund/chargeback.
-- * orders.affiliate_code / affiliate_id: captured at checkout (code field
--   beats cookie, cookie holds the most recent click), confirmed into a
--   commission only once the order is PAID.
-- * Owner-type CHECKs on wallets / wallet_entries / withdrawals /
--   withdrawal_otps are rebuilt to admit AFFILIATE (old auto-named
--   constraints are dropped by definition-match, so this works regardless of
--   the Postgres-generated constraint names).
-- * payout_config gains every CONFIGURABLE affiliate knob (minimums, daily
--   limit, fee reuse, commission mode/value rule, attribution window).

-- ── Affiliates ──
CREATE TABLE IF NOT EXISTS affiliates (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code                      TEXT NOT NULL UNIQUE,
  full_name                 TEXT NOT NULL,
  phone                     TEXT,
  email                     TEXT,
  status                    TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'BANNED')),
  status_reason             TEXT,
  recipient_code            TEXT,
  bank_code                 TEXT,
  bank_name                 TEXT,
  bank_account_number       TEXT,
  bank_account_name         TEXT,
  payout_account_changed_at TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates (code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates (status);
CREATE INDEX IF NOT EXISTS idx_affiliates_user ON affiliates (user_id);

-- ── Referral link clicks ──
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate ON affiliate_clicks (affiliate_id, created_at DESC);

-- ── One commission per order (idempotent) ──
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  order_id      UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  base_kobo     BIGINT NOT NULL CHECK (base_kobo >= 0),
  amount_kobo   BIGINT NOT NULL CHECK (amount_kobo >= 0),
  mode          TEXT NOT NULL DEFAULT 'PERCENT' CHECK (mode IN ('PERCENT', 'FLAT')),
  rate_snapshot JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RELEASED', 'REVERSED')),
  released_at   TIMESTAMPTZ,
  reversed_at   TIMESTAMPTZ,
  reversed_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate ON affiliate_commissions (affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_order ON affiliate_commissions (order_id);

-- ── Attribution captured at checkout, confirmed on payment ──
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_affiliate ON orders (affiliate_id);

-- ── Admit AFFILIATE into every polymorphic owner_type CHECK ──
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname::text AS name, conrelid::regclass::text AS tbl
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('wallets'::regclass, 'wallet_entries'::regclass, 'withdrawals'::regclass, 'withdrawal_otps'::regclass)
      AND pg_get_constraintdef(oid) LIKE '%owner_type%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.name);
  END LOOP;
END $$;

ALTER TABLE wallets
  ADD CONSTRAINT wallets_owner_type_check CHECK (owner_type IN ('VENDOR', 'RIDER', 'AFFILIATE'));
ALTER TABLE wallet_entries
  ADD CONSTRAINT wallet_entries_owner_type_check CHECK (owner_type IN ('VENDOR', 'RIDER', 'AFFILIATE'));
ALTER TABLE withdrawals
  ADD CONSTRAINT withdrawals_owner_type_check CHECK (owner_type IN ('VENDOR', 'RIDER', 'AFFILIATE'));
ALTER TABLE withdrawal_otps
  ADD CONSTRAINT withdrawal_otps_owner_type_check CHECK (owner_type IN ('VENDOR', 'RIDER', 'AFFILIATE'));

-- ── Owner-scoped hold uniqueness (was global per order) ──
-- Vendors AND affiliates each hold one entry per order for the SAME order
-- (vendor net + affiliate commission), so the old (order_id, kind) unique
-- index would reject the second rail. Scope it to the owner: idempotency per
-- owner is preserved, cross-rail coexistence allowed.
DROP INDEX IF EXISTS idx_wallet_entries_order_hold;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_entries_owner_order_hold
  ON wallet_entries (owner_type, owner_id, order_id)
  WHERE order_id IS NOT NULL AND kind = 'hold';

-- ── Affiliate CONFIGURABLE defaults (merge only, never overwrite admin edits) ──
UPDATE platform_settings
SET value = value
  || '{"affiliate_min_withdrawal_kobo":300000,"affiliate_max_withdrawal_kobo":50000000,"affiliate_auto_approve_below_kobo":5000000}'
  || '{"affiliate_daily_withdrawal_limit":2,"affiliate_hold_days":0}'
  || '{"affiliate_commission_mode":"PERCENT","affiliate_commission_pct":5,"affiliate_commission_flat_kobo":0}'
  || '{"affiliate_base_excludes_delivery_fee":true,"affiliate_base_subtracts_discount":true,"affiliate_attribution_days":7}',
    updated_at = NOW()
WHERE key = 'payout_config';

-- Backfill one wallet row per existing affiliate (none yet on fresh installs).
INSERT INTO wallets (owner_type, owner_id, available_kobo, pending_kobo)
SELECT 'AFFILIATE', a.id, 0, 0 FROM affiliates a
ON CONFLICT (owner_type, owner_id) DO NOTHING;
