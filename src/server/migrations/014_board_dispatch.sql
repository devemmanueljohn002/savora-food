-- Savora Food — open board dispatch: per-rider dismissals, unclaimed
-- escalation state, payout bonus, and the board lookup index.
-- Additive only. The legacy delivery_offers flow is retired by code; its
-- table is left untouched for history.

-- Per-rider "not interested": hides a board job from one rider only.
CREATE TABLE IF NOT EXISTS rider_job_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_partner_id UUID NOT NULL REFERENCES delivery_partners(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, delivery_partner_id)
);
CREATE INDEX IF NOT EXISTS idx_rider_dismissals_rider
  ON rider_job_dismissals (delivery_partner_id, created_at DESC);

-- Unclaimed-escalation state + optional payout bump (platform-funded).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_bonus NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- Board lookup: open jobs by status, unassigned first, oldest first.
CREATE INDEX IF NOT EXISTS idx_orders_board
  ON orders (status, created_at ASC)
  WHERE delivery_partner_id IS NULL;
