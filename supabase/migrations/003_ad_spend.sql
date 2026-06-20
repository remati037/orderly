-- =============================================================
-- Orderly — Facebook / Meta Ads spend
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- 1. AD ACCOUNTS — one row per connected Meta ad account
CREATE TABLE IF NOT EXISTS ad_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  fb_account_id  TEXT NOT NULL,            -- e.g. "act_1234567890"
  access_token   TEXT NOT NULL,            -- System User token
  currency       TEXT NOT NULL DEFAULT 'EUR',
  is_active      BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fb_account_id)
);

-- 2. AD SPEND — raw daily spend per campaign (pulled from Meta Insights API)
CREATE TABLE IF NOT EXISTS ad_spend (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id  UUID REFERENCES ad_accounts(id) ON DELETE CASCADE NOT NULL,
  campaign_id    TEXT NOT NULL,
  date           DATE NOT NULL,
  spend          DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ad_account_id, campaign_id, date)
);

-- 3. AD CAMPAIGN MAP — manual mapping of a campaign to a site / product.
--    Persists across syncs; campaign_name is refreshed on each sync.
CREATE TABLE IF NOT EXISTS ad_campaign_map (
  campaign_id    TEXT PRIMARY KEY,
  ad_account_id  UUID REFERENCES ad_accounts(id) ON DELETE CASCADE NOT NULL,
  campaign_name  TEXT NOT NULL,
  site_id        UUID REFERENCES sites(id) ON DELETE SET NULL,
  product_name   TEXT,                     -- NULL = spend applies to the whole site
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE ad_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaign_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_all" ON ad_accounts     FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON ad_spend        FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON ad_campaign_map FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_all" ON ad_accounts     FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON ad_spend        FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON ad_campaign_map FOR ALL TO service_role USING (true);

-- =============================================================
-- Indexes
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_ad_spend_account   ON ad_spend(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_campaign  ON ad_spend(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_date      ON ad_spend(date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_map_site        ON ad_campaign_map(site_id);
