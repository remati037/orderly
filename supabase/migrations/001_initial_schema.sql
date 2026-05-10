-- =============================================================
-- Orderly — Initial Schema
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- 1. SITES
CREATE TABLE sites (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  platform               TEXT NOT NULL CHECK (platform IN ('woocommerce', 'thinkific')),
  url                    TEXT,
  subdomain              TEXT,
  consumer_key           TEXT,
  consumer_secret        TEXT,
  thinkific_api_key      TEXT,
  color_hex              TEXT NOT NULL DEFAULT '#1B6EF3',
  is_active              BOOLEAN DEFAULT true,
  project_type           TEXT NOT NULL DEFAULT 'standard'
                           CHECK (project_type IN ('standard', 'subscription', 'digital')),
  default_margin_percent DECIMAL(5,2) DEFAULT 100,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CUSTOMERS
CREATE TABLE customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  name           TEXT,
  total_spent    DECIMAL(12,2) DEFAULT 0,
  net_spent      DECIMAL(12,2) DEFAULT 0,
  order_count    INTEGER DEFAULT 0,
  first_order_at TIMESTAMPTZ,
  last_order_at  TIMESTAMPTZ,
  city           TEXT,
  country        TEXT DEFAULT 'RS',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ORDERS
CREATE TABLE orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID REFERENCES sites(id) ON DELETE CASCADE NOT NULL,
  woo_order_id   TEXT,
  source         TEXT NOT NULL CHECK (source IN ('woocommerce', 'thinkific')),
  status         TEXT NOT NULL DEFAULT 'pending',
  total          DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_profit     DECIMAL(12,2) DEFAULT 0,
  currency       TEXT DEFAULT 'RSD',
  customer_id    UUID REFERENCES customers(id),
  customer_name  TEXT,
  customer_email TEXT,
  customer_city  TEXT,
  product_type   TEXT DEFAULT 'physical'
                   CHECK (product_type IN ('physical', 'digital', 'subscription')),
  payment_type   TEXT DEFAULT 'one-time',
  woo_data       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, woo_order_id)
);

-- 4. ORDER ITEMS
CREATE TABLE order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_name TEXT NOT NULL,
  product_type TEXT DEFAULT 'physical',
  quantity     INTEGER DEFAULT 1,
  price        DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost         DECIMAL(12,2) DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PRODUCTS (for COGS)
CREATE TABLE products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID REFERENCES sites(id) ON DELETE CASCADE,
  woo_product_id TEXT,
  name           TEXT NOT NULL,
  product_type   TEXT DEFAULT 'physical',
  cost_percent   DECIMAL(5,2),
  cost_fixed     DECIMAL(12,2),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SUBSCRIPTIONS
CREATE TABLE subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID REFERENCES customers(id),
  site_id        UUID REFERENCES sites(id) ON DELETE CASCADE,
  product_name   TEXT,
  mrr            DECIMAL(12,2) DEFAULT 0,
  status         TEXT DEFAULT 'active'
                   CHECK (status IN ('active', 'cancelled', 'paused', 'trial')),
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at   TIMESTAMPTZ,
  next_billing_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 7. SETTINGS (key-value store)
CREATE TABLE settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. SYNC LOG
CREATE TABLE sync_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID REFERENCES sites(id) ON DELETE CASCADE,
  type         TEXT CHECK (type IN ('webhook', 'manual', 'cron')),
  status       TEXT CHECK (status IN ('success', 'error', 'partial')),
  orders_synced INTEGER DEFAULT 0,
  error_msg    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 9. SOUND SETTINGS
CREATE TABLE sound_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID REFERENCES sites(id) ON DELETE CASCADE,
  sound_url       TEXT,
  volume          DECIMAL(3,2) DEFAULT 0.7,
  enabled         BOOLEAN DEFAULT true,
  trigger_statuses TEXT[] DEFAULT ARRAY['processing', 'completed'],
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- Row Level Security
-- =============================================================

ALTER TABLE sites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sound_settings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read everything
-- (write control handled at API level via Clerk / service role)
CREATE POLICY "authenticated_read_all" ON sites         FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON customers     FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON orders        FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON order_items   FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON products      FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON settings      FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON sync_log      FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON sound_settings FOR SELECT TO authenticated USING (true);

-- Service role has full access (used by webhooks and sync jobs)
CREATE POLICY "service_role_all" ON sites         FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON customers     FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON orders        FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON order_items   FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON products      FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON subscriptions FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON settings      FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON sync_log      FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON sound_settings FOR ALL TO service_role USING (true);

-- =============================================================
-- Performance indexes
-- =============================================================

CREATE INDEX idx_orders_site_id        ON orders(site_id);
CREATE INDEX idx_orders_created_at     ON orders(created_at DESC);
CREATE INDEX idx_orders_status         ON orders(status);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);
CREATE INDEX idx_order_items_order_id  ON order_items(order_id);
CREATE INDEX idx_customers_email       ON customers(email);
