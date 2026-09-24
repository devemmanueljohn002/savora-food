-- Savora Food — checkout coupon tracking
-- Additive only.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
