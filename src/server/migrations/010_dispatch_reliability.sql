-- Savora Food — dispatch reliability: explicit assignment state + single live offer
-- Additive only. dispatch_status tracks the offer lifecycle per order so
-- exhausted orders become visibly UNASSIGNED instead of looping forever.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatch_status TEXT NOT NULL DEFAULT 'PENDING_ASSIGNMENT'
  CHECK (dispatch_status IN ('PENDING_ASSIGNMENT', 'OFFERED', 'ASSIGNED', 'UNASSIGNED', 'CANCELLED'));

-- Backfill current reality: assigned > offered > cancelled, else pending.
UPDATE orders o
SET dispatch_status = CASE
  WHEN o.status = 'CANCELLED' THEN 'CANCELLED'
  WHEN EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = o.id AND d.status NOT IN ('FAILED', 'CANCELLED')) THEN 'ASSIGNED'
  WHEN EXISTS (SELECT 1 FROM delivery_offers f WHERE f.order_id = o.id AND f.status = 'OFFERED' AND f.expires_at > NOW()) THEN 'OFFERED'
  ELSE 'PENDING_ASSIGNMENT'
END
WHERE o.dispatch_status = 'PENDING_ASSIGNMENT';

-- Exactly one live offer per order, enforced by the database: concurrent
-- dispatch runs cannot create duplicate batches. Second insert loses with
-- a unique violation, which the code treats as "already offered".
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_offers_single_live
  ON delivery_offers (order_id)
  WHERE status = 'OFFERED';
