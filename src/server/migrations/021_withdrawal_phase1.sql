-- Savora Food — Phase 1 withdrawals hardening
-- Additive only. Extends 008_polymorphic_wallets.sql.
--
-- What this adds (all CONFIGURABLE via platform_settings.payout_config):
-- * Vendor minimum ₦10,000 (1,000,000 kobo), rider minimum ₦5,000 (500,000 kobo).
-- * Daily withdrawal counts: vendor 2/day, rider 3/day (server-enforced).
-- * Transfer fee: transfer_fee_kobo (default ₦100 = 10,000 kobo) + bearer
--   transfer_fee_bearer ('USER' = deducted from recipient, 'SAVORA' = platform absorbs).
-- * Approval mode: payout_approval_mode ('AUTO' default = threshold rule,
--   'MANUAL' = every request parks for admin approval).
-- * withdrawal_otps: email OTPs required before a withdrawal POST is accepted.
-- * withdrawals.fee_kobo / net_kobo: auditable fee snapshot per request.

-- ── OTP table (email codes, hashed, single-use, 10-min expiry) ──
CREATE TABLE IF NOT EXISTS withdrawal_otps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('VENDOR', 'RIDER')),
  owner_id      UUID NOT NULL,
  code_hash     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_otps_owner ON withdrawal_otps (owner_type, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_otps_expiry ON withdrawal_otps (expires_at);

-- ── Fee snapshot per withdrawal (auditable) ──
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fee_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS net_kobo BIGINT;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fee_bearer TEXT NOT NULL DEFAULT 'USER'
  CHECK (fee_bearer IN ('USER', 'SAVORA'));

-- Daily-limit counting needs a fast per-owner per-day lookup.
CREATE INDEX IF NOT EXISTS idx_withdrawals_owner_day ON withdrawals (owner_type, owner_id, created_at DESC);

-- ── New payout_config defaults (only fills missing keys, never overwrites admin edits) ──
UPDATE platform_settings
SET value = value
  || '{"min_withdrawal_kobo":1000000}'
  || '{"rider_min_withdrawal_kobo":500000}'
  || '{"vendor_daily_withdrawal_limit":2,"rider_daily_withdrawal_limit":3}'
  || '{"transfer_fee_kobo":10000,"transfer_fee_bearer":"USER"}'
  || '{"payout_approval_mode":"AUTO"}',
    updated_at = NOW()
WHERE key = 'payout_config';

-- Backfill any single missing key without clobbering the rest ( belt & braces:
-- the || above already merges, this fixes rows where value was e.g. a subset).
INSERT INTO platform_settings (key, value) VALUES
  ('payout_config', '{"vendor_commission_pct":10,"rider_share_of_delivery_fee_pct":100,"platform_keeps_service_fee":true,"platform_keeps_tax":false,"hold_days":2,"min_withdrawal_kobo":1000000,"max_withdrawal_kobo":50000000,"auto_approve_below_kobo":5000000,"rider_hold_days":1,"rider_min_withdrawal_kobo":500000,"rider_max_withdrawal_kobo":50000000,"rider_auto_approve_below_kobo":5000000,"bank_change_cooling_hours":24,"cancelled_pickup_fee_pct":50,"vendor_daily_withdrawal_limit":2,"rider_daily_withdrawal_limit":3,"transfer_fee_kobo":10000,"transfer_fee_bearer":"USER","payout_approval_mode":"AUTO"}')
ON CONFLICT (key) DO NOTHING;
