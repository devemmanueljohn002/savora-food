-- Savora Food — order flow phase A: itemized fees (service fee + tax)
-- Additive only. Extends 003_coupon_code.sql.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Config-driven pricing consumed by quoteCheckout / createOrdersFromCart.
-- service_fee_type: PERCENT (of subtotal) or FLAT (naira per vendor order).
-- tax_rate_percent: applied to (subtotal - discount + service_fee).
INSERT INTO platform_settings (key, value) VALUES
  ('pricing_config', '{"service_fee_type":"PERCENT","service_fee_value":5,"tax_rate_percent":7.5}')
ON CONFLICT (key) DO NOTHING;
