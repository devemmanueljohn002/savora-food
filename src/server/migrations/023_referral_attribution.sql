-- Savora Food — referral attribution on the user (signup-once referrer)
-- Additive only.
--
-- * users.referred_by_affiliate_id: the referrer saved at signup, exactly
--   once (never updated afterwards, so it can't be changed later). Only new
--   signups get one — an existing logged-in account opening /ref/[code] is
--   never attached. NULL = no referrer.
-- * Behavior change (code-level, documented here): affiliate commissions are
--   now created only when the referred customer's order reaches DELIVERED
--   (delivery verified). Nothing is created at signup or at order placement;
--   orders still carry affiliate_code / affiliate_id from checkout for
--   attribution. PENDING holds are therefore only ever written for delivered
--   orders and release on the normal maturity path.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_by_affiliate_id UUID NULL REFERENCES affiliates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_referred_by_affiliate ON users (referred_by_affiliate_id);
