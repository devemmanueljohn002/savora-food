-- Savora Food — role dashboards & supporting schema
-- Additive only. Extends 001_init.sql.

-- ──────────────────────────────────────────────
-- Roles & admin permissions
-- ──────────────────────────────────────────────

INSERT INTO roles (name) VALUES ('SUPER_ADMIN') ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_permissions (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '[]',   -- e.g. ["vendors","payments","support"]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Email verification tokens
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens (user_id);

-- ──────────────────────────────────────────────
-- Product variants
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_variants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  price          NUMERIC(12, 2),           -- optional override of product price
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants (product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_product_name ON product_variants (product_id, name);

ALTER TABLE products ADD COLUMN IF NOT EXISTS preparation_minutes INTEGER;

-- ──────────────────────────────────────────────
-- Vendor staff
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'STAFF' CHECK (role IN ('OWNER', 'MANAGER', 'STAFF')),
  status     TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_staff_vendor ON vendor_staff (vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_staff_email ON vendor_staff (vendor_id, lower(email));

-- ──────────────────────────────────────────────
-- Commissions & payouts
-- ──────────────────────────────────────────────

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00;

CREATE TABLE IF NOT EXISTS vendor_payouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  reference         TEXT NOT NULL UNIQUE,
  period_start      DATE,
  period_end        DATE,
  gross_amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  fees_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED')),
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_payouts_vendor ON vendor_payouts (vendor_id, created_at DESC);

-- ──────────────────────────────────────────────
-- Rider verification
-- ──────────────────────────────────────────────

ALTER TABLE delivery_partners
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rating_average NUMERIC(3, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS document_note TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_partners_user ON delivery_partners (user_id);

CREATE TABLE IF NOT EXISTS rider_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_partner_id  UUID NOT NULL REFERENCES delivery_partners(id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL CHECK (kind IN ('DRIVERS_LICENSE', 'PROOF_OF_IDENTITY', 'PROFILE_PHOTO', 'VEHICLE_DOCUMENT', 'OTHER')),
  url                  TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_documents_partner ON rider_documents (delivery_partner_id);

-- ──────────────────────────────────────────────
-- Orders: preferred delivery time
-- ──────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS preferred_delivery_time TIMESTAMPTZ;

-- ──────────────────────────────────────────────
-- Coupons: vendor scoping
-- ──────────────────────────────────────────────

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE;

-- ──────────────────────────────────────────────
-- Platform settings (super-admin config surface)
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (key, value) VALUES
  ('payment_config',     '{"provider":"PAYSTACK","enabled":true}'),
  ('subscription_config','{"free_plan":true,"tiers":["FREE","PRO","ENTERPRISE"]}'),
  ('country_config',     '{"country":"Nigeria","currency":"NGN"}'),
  ('delivery_config',    '{"base_fee":800,"per_km":150}'),
  ('commission_config',  '{"default_rate":10.00}')
ON CONFLICT (key) DO NOTHING;

-- ──────────────────────────────────────────────
-- Categories: vendor-managed category approvals
-- ──────────────────────────────────────────────

ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;