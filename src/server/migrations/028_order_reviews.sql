-- Savora Food — customer ratings & reviews for delivered orders
-- Additive only. Vendor ratings are public; rider feedback is admin-only.
--
-- One review per order (unique order_id). The rider is snapshotted from the
-- order's assigned delivery partner at review time and may be NULL when no
-- rider was involved.

CREATE TABLE IF NOT EXISTS order_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_id      UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  rider_id       UUID REFERENCES delivery_partners(id) ON DELETE SET NULL,
  vendor_rating  INTEGER NOT NULL CHECK (vendor_rating BETWEEN 1 AND 5),
  vendor_comment TEXT CHECK (vendor_comment IS NULL OR char_length(vendor_comment) <= 500),
  rider_rating   INTEGER CHECK (rider_rating BETWEEN 1 AND 5),
  rider_comment  TEXT CHECK (rider_comment IS NULL OR char_length(rider_comment) <= 500),
  is_hidden      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_reviews_vendor
  ON order_reviews (vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_rider
  ON order_reviews (rider_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_created_at
  ON order_reviews (created_at DESC);
