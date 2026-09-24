-- Savora Food — rider dispatch, live tracking, OTP verification, financial ledger
-- Additive only. Extends 005_vendor_accept.sql.

-- ── Order status: rider assigned ──
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'PENDING_PAYMENT', 'PAID', 'VENDOR_ACCEPTED', 'CONFIRMED', 'PREPARING',
    'READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED'
  ));

-- ── Rider presence & zones (zone-based v1: city text matching, no lat/lng required) ──
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS current_zone TEXT;
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS last_assignment_at TIMESTAMPTZ;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS delivery_zone TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS delivery_zone TEXT;

-- ── Targeted dispatch offers ──
CREATE TABLE IF NOT EXISTS delivery_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_partner_id UUID REFERENCES delivery_partners(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  attempt_no INTEGER NOT NULL DEFAULT 1,
  earnings_snapshot NUMERIC(12, 2) NOT NULL DEFAULT 0,
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 seconds',
  responded_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_order ON delivery_offers (order_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_rider ON delivery_partners (id);

-- ── Delivery lifecycle: finer-grained rider states ──
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES delivery_offers(id) ON DELETE SET NULL;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS arrived_at_vendor_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS going_to_vendor_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_code_hash TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_code_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_code_verified_at TIMESTAMPTZ;
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE deliveries
  ADD CONSTRAINT deliveries_status_check CHECK (status IN (
    'OFFERED','ASSIGNED','GOING_TO_VENDOR','ARRIVED_AT_VENDOR','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED','CANCELLED'
  ));

-- ── Rider live locations (short-polling v1; coords optional so zone heartbeats work) ──
CREATE TABLE IF NOT EXISTS rider_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_partner_id UUID NOT NULL REFERENCES delivery_partners(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  lat NUMERIC(10, 7),
  lng NUMERIC(10, 7),
  accuracy_m INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rider_locations_partner ON rider_locations (delivery_partner_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_locations_delivery ON rider_locations (delivery_id, recorded_at DESC);

-- ── Financial ledger ──
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('CHARGE','VENDOR_PAYOUT','RIDER_EARNING','PLATFORM_FEE','TAX','DISCOUNT','REFUND')),
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  beneficiary_type TEXT,
  beneficiary_id UUID,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions (reference);

CREATE TABLE IF NOT EXISTS order_money_splits (
  order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  food_subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  service_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vendor_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  rider_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  platform_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  config_snapshot JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  reference TEXT NOT NULL UNIQUE,
  amount NUMERIC(12, 2) NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PROCESSED' CHECK (status IN ('PENDING','PROCESSED','FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds (order_id);

-- ── Payout config (no hard-coded percentages in code) ──
INSERT INTO platform_settings (key, value) VALUES
  ('payout_config', '{"vendor_commission_pct":10,"rider_share_of_delivery_fee_pct":100,"platform_keeps_service_fee":true,"platform_keeps_tax":false}')
ON CONFLICT (key) DO NOTHING;
