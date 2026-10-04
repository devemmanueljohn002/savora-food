-- Savora Food — vendor open flag + dispatch lookup indexes
-- Additive only.
-- vendors.is_open lets a kitchen pause ordering (closed) without changing
-- its approval status. Checkout and cart-adds require is_open = TRUE.
-- Also repairs idx_delivery_offers_rider (it indexed delivery_partners(id),
-- i.e. the primary key — useless for the rider-jobs feed lookup) and adds
-- the missing deliveries(delivery_partner_id) lookup index.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE;

DROP INDEX IF EXISTS idx_delivery_offers_rider;
CREATE INDEX IF NOT EXISTS idx_delivery_offers_rider
  ON delivery_offers (delivery_partner_id, status);

CREATE INDEX IF NOT EXISTS idx_deliveries_partner
  ON deliveries (delivery_partner_id, created_at DESC);
