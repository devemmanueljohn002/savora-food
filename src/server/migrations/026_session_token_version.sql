-- Savora Food — session token version + salted delivery codes
-- Additive only.
--
-- * users.token_version: bumped on logout-all and password reset so
--   previously minted stateless access JWTs stop verifying (logout and
--   reset previously left them valid until expiry).
-- * orders.delivery_code_salt: per-order salt for the handover code hash
--   (unsalted SHA-256 over 4 digits is rainbow-trivial on DB read).
--   Legacy unsalted rows keep verifying during transition.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_code_salt TEXT NULL;
