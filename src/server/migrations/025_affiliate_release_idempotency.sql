-- Savora Food — affiliate release idempotency guard
-- Additive only.
--
-- releaseAffiliateHolds() inserts one wallet_entries row of kind 'release'
-- per (owner, order). The pre-existing partial unique index only covers
-- kind = 'hold', so concurrent releasers could both pass the NOT EXISTS
-- check and double-credit. This matching partial index makes the
-- INSERT ... ON CONFLICT DO NOTHING in the release path actually fire,
-- and the code additionally checks the insert row-count before mutating
-- balances, so the fix holds even on databases where this index cannot be
-- created (e.g. pre-existing duplicate release rows — dedupe those first).

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_entries_owner_order_release
  ON wallet_entries (owner_type, owner_id, order_id)
  WHERE order_id IS NOT NULL AND kind = 'release';
