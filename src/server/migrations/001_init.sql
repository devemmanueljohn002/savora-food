-- Savora Food — initial schema
-- PostgreSQL (Neon-compatible). Run via `npm run db:migrate`.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ──────────────────────────────────────────────
-- Reference / identity
-- ──────────────────────────────────────────────

CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (name) VALUES
  ('CUSTOMER'),
  ('VENDOR'),
  ('ADMIN'),
  ('DELIVERY_PARTNER')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL UNIQUE,
  phone               TEXT,
  password_hash       TEXT NOT NULL,
  first_name          TEXT NOT NULL DEFAULT '',
  last_name           TEXT NOT NULL DEFAULT '',
  role                TEXT NOT NULL DEFAULT 'CUSTOMER' REFERENCES roles(name),
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'BANNED')),
  email_verified_at   TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_phone ON users (phone);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_created_at ON users (created_at);

CREATE TABLE user_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  avatar_url  TEXT,
  bio         TEXT,
  city        TEXT,
  state       TEXT,
  country     TEXT DEFAULT 'Nigeria',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Sessions & password reset tokens
-- ──────────────────────────────────────────────

CREATE TABLE sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  user_agent         TEXT,
  ip_address         TEXT,
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_refresh_hash ON sessions (refresh_token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_user ON password_reset_tokens (user_id);

-- ──────────────────────────────────────────────
-- Locations (data-driven delivery cities)
-- ──────────────────────────────────────────────

CREATE TABLE locations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  state                  TEXT NOT NULL,
  city                   TEXT,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_fee           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  delivery_time_minutes  INTEGER NOT NULL DEFAULT 60,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_name ON locations (name);

-- ──────────────────────────────────────────────
-- Vendors & verification
-- ──────────────────────────────────────────────

CREATE TABLE vendors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name       TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  owner_name          TEXT NOT NULL,
  phone               TEXT,
  email               TEXT,
  description         TEXT,
  address             TEXT,
  city                TEXT,
  state               TEXT,
  banner_image_url    TEXT,
  logo_url            TEXT,
  bank_name           TEXT,
  bank_account_name   TEXT,
  bank_account_number TEXT,
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  rating_average      NUMERIC(3, 2) NOT NULL DEFAULT 0,
  rating_count        INTEGER NOT NULL DEFAULT 0,
  is_featured         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendors_slug ON vendors (slug);
CREATE INDEX idx_vendors_status ON vendors (status);
CREATE INDEX idx_vendors_user_id ON vendors (user_id);
CREATE INDEX idx_vendors_rating ON vendors (rating_average DESC);

CREATE TABLE vendor_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('CAC_CERTIFICATE', 'PROOF_OF_IDENTITY', 'BUSINESS_LOGO', 'VENDOR_LICENSE', 'OTHER')),
  url         TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendor_documents_vendor ON vendor_documents (vendor_id);

-- ──────────────────────────────────────────────
-- Categories & products
-- ──────────────────────────────────────────────

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_slug ON categories (slug);

CREATE TABLE vendor_categories (
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (vendor_id, category_id)
);

CREATE TABLE products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id          UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  category_id        UUID REFERENCES categories(id) ON DELETE SET NULL,
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  description        TEXT,
  short_description  TEXT,
  price              NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  compare_at_price   NUMERIC(12, 2) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  cost_price         NUMERIC(12, 2) CHECK (cost_price IS NULL OR cost_price >= 0),
  image_url          TEXT,
  ingredients        JSONB NOT NULL DEFAULT '[]',
  prep_info          TEXT,
  availability       BOOLEAN NOT NULL DEFAULT TRUE,
  stock_quantity     INTEGER NOT NULL DEFAULT 0,
  rating_average     NUMERIC(3, 2) NOT NULL DEFAULT 0,
  rating_count       INTEGER NOT NULL DEFAULT 0,
  is_featured        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  product_type       TEXT CHECK (product_type IN ('FOOD', 'CAKE', 'SNACK', 'DRINK', 'CATERING')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_slug ON products (slug);
CREATE INDEX idx_products_vendor_id ON products (vendor_id);
CREATE INDEX idx_products_category_id ON products (category_id);
CREATE INDEX idx_products_type ON products (product_type);
CREATE INDEX idx_products_active ON products (is_active, availability);
CREATE INDEX idx_products_price ON products (price);
CREATE INDEX idx_products_rating ON products (rating_average DESC);
CREATE INDEX idx_products_created_at ON products (created_at DESC);

CREATE TABLE product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_images_product ON product_images (product_id);

-- ──────────────────────────────────────────────
-- Carts
-- ──────────────────────────────────────────────

CREATE TABLE carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cart_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id             UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  custom_instructions TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, product_id)
);

CREATE INDEX idx_cart_items_cart ON cart_items (cart_id);

-- ──────────────────────────────────────────────
-- Addresses
-- ──────────────────────────────────────────────

CREATE TABLE addresses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label          TEXT,
  recipient_name TEXT,
  phone          TEXT,
  full_address   TEXT NOT NULL,
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  country        TEXT NOT NULL DEFAULT 'Nigeria',
  landmark       TEXT,
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_user_id ON addresses (user_id);

-- ──────────────────────────────────────────────
-- Orders (one vendor per order)
-- ──────────────────────────────────────────────

CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          TEXT NOT NULL UNIQUE,
  user_id               UUID NOT NULL REFERENCES users(id),
  vendor_id             UUID NOT NULL REFERENCES vendors(id),
  address_id            UUID REFERENCES addresses(id),
  status                TEXT NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED')),
  currency              TEXT NOT NULL DEFAULT 'NGN',
  subtotal              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  delivery_fee          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total                 NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_provider      TEXT,
  payment_status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  delivery_instructions TEXT,
  delivery_partner_id   UUID,
  cancelled_at          TIMESTAMPTZ,
  cancelled_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_vendor_id ON orders (vendor_id, created_at DESC);
CREATE INDEX idx_orders_number ON orders (order_number);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_created_at ON orders (created_at DESC);

CREATE TABLE order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  unit_price          NUMERIC(12, 2) NOT NULL,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  line_total          NUMERIC(12, 2) NOT NULL,
  custom_instructions TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

CREATE TABLE order_status_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_status_history_order ON order_status_history (order_id, created_at);

CREATE TABLE payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_reference TEXT NOT NULL UNIQUE,
  provider         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
  amount           NUMERIC(12, 2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'NGN',
  raw_payload      JSONB NOT NULL DEFAULT '{}',
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id ON payments (order_id);
CREATE INDEX idx_payments_reference ON payments (payment_reference);
CREATE INDEX idx_payments_status ON payments (status);

-- ──────────────────────────────────────────────
-- Delivery
-- ──────────────────────────────────────────────

CREATE TABLE delivery_partners (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  phone            TEXT,
  vehicle_type     TEXT,
  vehicle_number   TEXT,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'OFFLINE', 'SUSPENDED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  delivery_partner_id UUID REFERENCES delivery_partners(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED')),
  tracking_note       TEXT,
  assigned_at         TIMESTAMPTZ,
  picked_up_at        TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_order ON deliveries (order_id);
CREATE INDEX idx_deliveries_status ON deliveries (status);

-- ──────────────────────────────────────────────
-- Reviews (& transactional rating maintenance)
-- ──────────────────────────────────────────────

CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  images      JSONB NOT NULL DEFAULT '[]',
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- one review per (user, order, product); vendor-level reviews leave product_id NULL
  UNIQUE (user_id, order_id, product_id, vendor_id)
);

CREATE INDEX idx_reviews_product ON reviews (product_id);
CREATE INDEX idx_reviews_vendor ON reviews (vendor_id);
CREATE INDEX idx_reviews_user ON reviews (user_id);
CREATE INDEX idx_reviews_created_at ON reviews (created_at DESC);

CREATE OR REPLACE FUNCTION refresh_product_rating() RETURNS TRIGGER AS $$
DECLARE
  target_id UUID;
  avg_rating NUMERIC;
  cnt INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.product_id;
  ELSE
    target_id := NEW.product_id;
  END IF;
  IF target_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT COALESCE(AVG(rating)::NUMERIC, 0), COUNT(*) INTO avg_rating, cnt
  FROM reviews WHERE product_id = target_id AND is_approved = TRUE;
  UPDATE products
    SET rating_average = ROUND(avg_rating, 2), rating_count = cnt, updated_at = NOW()
  WHERE id = target_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_vendor_rating() RETURNS TRIGGER AS $$
DECLARE
  target_id UUID;
  avg_rating NUMERIC;
  cnt INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.vendor_id;
  ELSE
    target_id := NEW.vendor_id;
  END IF;
  SELECT COALESCE(AVG(rating)::NUMERIC, 0), COUNT(*) INTO avg_rating, cnt
  FROM reviews WHERE vendor_id = target_id AND is_approved = TRUE;
  UPDATE vendors
    SET rating_average = ROUND(avg_rating, 2), rating_count = cnt, updated_at = NOW()
  WHERE id = target_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_review_product ON reviews;
CREATE TRIGGER trg_review_product
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION refresh_product_rating();

DROP TRIGGER IF EXISTS trg_review_vendor ON reviews;
CREATE TRIGGER trg_review_vendor
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION refresh_vendor_rating();

-- ──────────────────────────────────────────────
-- Favorites & notifications
-- ──────────────────────────────────────────────

CREATE TABLE favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  vendor_id  UUID REFERENCES vendors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (product_id IS NOT NULL OR vendor_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_favorites_product ON favorites (user_id, product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX idx_favorites_vendor ON favorites (user_id, vendor_id) WHERE vendor_id IS NOT NULL;

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB NOT NULL DEFAULT '{}',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);

-- ──────────────────────────────────────────────
-- Catering
-- ──────────────────────────────────────────────

CREATE TABLE catering_packages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id          UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  description        TEXT,
  price_per_guest    NUMERIC(12, 2) NOT NULL,
  minimum_guests     INTEGER NOT NULL DEFAULT 25,
  included_services  JSONB NOT NULL DEFAULT '[]',
  event_types        JSONB NOT NULL DEFAULT '[]',
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catering_packages_vendor ON catering_packages (vendor_id);
CREATE INDEX idx_catering_packages_active ON catering_packages (is_active);

CREATE TABLE catering_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id         UUID NOT NULL REFERENCES catering_packages(id),
  user_id            UUID NOT NULL REFERENCES users(id),
  vendor_id          UUID NOT NULL REFERENCES vendors(id),
  full_name          TEXT NOT NULL,
  phone              TEXT NOT NULL,
  email              TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  event_date         DATE NOT NULL,
  event_location     TEXT NOT NULL,
  guest_count        INTEGER NOT NULL CHECK (guest_count > 0),
  special_requirements TEXT,
  status             TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'QUOTED', 'ACCEPTED', 'DECLINED', 'BOOKED', 'CANCELLED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catering_requests_vendor ON catering_requests (vendor_id, created_at DESC);
CREATE INDEX idx_catering_requests_user ON catering_requests (user_id, created_at DESC);

CREATE TABLE catering_quotes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL UNIQUE REFERENCES catering_requests(id) ON DELETE CASCADE,
  quote_amount  NUMERIC(12, 2) NOT NULL,
  per_guest     NUMERIC(12, 2) NOT NULL,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ
);

CREATE INDEX idx_catering_quotes_request ON catering_quotes (request_id);
CREATE INDEX idx_catering_quotes_status ON catering_quotes (status);

-- ──────────────────────────────────────────────
-- Promotions & coupons
-- ──────────────────────────────────────────────

CREATE TABLE coupons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL DEFAULT 'PERCENT' CHECK (type IN ('PERCENT', 'FIXED')),
  value      NUMERIC(12, 2) NOT NULL,
  max_uses   INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at  TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coupons_code ON coupons (code);

CREATE TABLE promotions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  description TEXT,
  image_url  TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at  TIMESTAMPTZ,
  ends_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Audit log
-- ──────────────────────────────────────────────

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  meta        JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- ──────────────────────────────────────────────
-- Migration bookkeeping (managed by scripts/migrate.ts)
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);