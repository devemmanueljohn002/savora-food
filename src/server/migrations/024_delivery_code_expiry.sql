-- Savora Food — delivery handover code expiry
-- Additive only.
--
-- orders.delivery_code_expires_at bounds the 4-digit handover code lifetime
-- (previously valid indefinitely until delivery/re-issue). The deliver
-- action rejects expired codes; pickup and the admin re-issue endpoint mint
-- fresh ones.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_code_expires_at TIMESTAMPTZ NULL;
