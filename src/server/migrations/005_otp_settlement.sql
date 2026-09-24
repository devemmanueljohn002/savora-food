-- Savora Food — order flow phases C+D: delivery OTP + settlement ledger
-- Additive only. Extends 004_pricing_fees.sql.

-- Phase C: optional delivery handshake code (plaintext 4-digit PIN; only
-- exposed to the order owner / assigned vendor / rider via authenticated APIs).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_otp TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS require_otp BOOLEAN NOT NULL DEFAULT FALSE;

-- Phase D: per-order financial settlement written when an order is DELIVERED.
CREATE TABLE IF NOT EXISTS order_settlements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id         UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  subtotal          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  delivery_fee      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  service_fee       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission_rate   NUMERIC(5, 2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  rider_fee         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vendor_net        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAYABLE', 'PAID')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_settlements_vendor ON order_settlements (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_settlements_order ON order_settlements (order_id);
