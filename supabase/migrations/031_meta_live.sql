-- =============================================================
-- Orderly — Meta ads live (/reklame)
--
-- Ad-level insights refreshed every 15 minutes, Claude's recommendations and
-- the log that keeps each Telegram alert to once a day. Server-only like 003:
-- everything goes through API routes on the service role.
--
-- settings.meta_live.target_cpa = { "<ad_accounts.id>": 25 } in base currency;
-- without one, the account's own 30-day average CPA is used as an estimate.
-- =============================================================

CREATE TABLE IF NOT EXISTS ad_insights_daily (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id      UUID REFERENCES ad_accounts(id) ON DELETE CASCADE NOT NULL,
  campaign_id        TEXT NOT NULL,
  campaign_name      TEXT,
  adset_id           TEXT,
  adset_name         TEXT,
  ad_id              TEXT NOT NULL,
  ad_name            TEXT,
  date               DATE NOT NULL,              -- day in the account's timezone
  spend              DECIMAL(12,2) NOT NULL DEFAULT 0,
  impressions        BIGINT NOT NULL DEFAULT 0,
  reach              BIGINT NOT NULL DEFAULT 0,
  frequency          DECIMAL(10,4) NOT NULL DEFAULT 0,
  inline_link_clicks BIGINT NOT NULL DEFAULT 0,
  ctr                DECIMAL(10,4) NOT NULL DEFAULT 0,
  cpm                DECIMAL(12,4) NOT NULL DEFAULT 0,
  purchases          INTEGER NOT NULL DEFAULT 0,
  purchase_value     DECIMAL(12,2) NOT NULL DEFAULT 0,
  add_to_cart        INTEGER NOT NULL DEFAULT 0,
  initiate_checkout  INTEGER NOT NULL DEFAULT 0,
  effective_status   TEXT,
  thumbnail_url      TEXT,
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ad_id, date)
);

CREATE TABLE IF NOT EXISTS ad_recommendations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  ad_account_id UUID REFERENCES ad_accounts(id) ON DELETE CASCADE NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('campaign', 'adset', 'ad')),
  entity_id     TEXT NOT NULL,
  entity_name   TEXT,
  type          TEXT NOT NULL CHECK (type IN ('skaliraj', 'ugasi', 'osvezi_kreativu', 'proveri')),
  priority      SMALLINT NOT NULL CHECK (priority BETWEEN 1 AND 3),
  text          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'ignored')),
  done_by       TEXT,
  done_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS meta_alerts_sent (
  key  TEXT NOT NULL,
  date DATE NOT NULL,
  PRIMARY KEY (key, date)
);

-- Secrets the settings table can't hold, since every signed-in member can read it.
CREATE TABLE IF NOT EXISTS service_secrets (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

ALTER TABLE ad_accounts
  ADD COLUMN IF NOT EXISTS meta_account_status INTEGER,
  ADD COLUMN IF NOT EXISTS live_synced_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS live_sync_error     TEXT;

ALTER TABLE ad_insights_daily  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_alerts_sent   ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_secrets    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON ad_insights_daily  FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON ad_recommendations FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON meta_alerts_sent   FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON service_secrets    FOR ALL TO service_role USING (true);

REVOKE ALL ON public.ad_insights_daily  FROM anon, authenticated;
REVOKE ALL ON public.ad_recommendations FROM anon, authenticated;
REVOKE ALL ON public.meta_alerts_sent   FROM anon, authenticated;
REVOKE ALL ON public.service_secrets    FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_ad_insights_date     ON ad_insights_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_insights_account  ON ad_insights_daily(ad_account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_recs_status       ON ad_recommendations(status, created_at DESC);

INSERT INTO settings (key, value)
VALUES ('meta_live', '{"target_cpa": {}}'::jsonb)
ON CONFLICT (key) DO NOTHING;
