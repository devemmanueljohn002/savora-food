-- Savora Food — hashed delivery codes.
-- The 4-digit handover code is stored as a SHA-256 hex digest from here on
-- (see issueDeliveryCode); delivery_otp keeps legacy plaintext codes issued
-- before this deploy so in-flight orders still verify (dual-read), and is
-- set to NULL for every newly issued code.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_code_hash TEXT;
