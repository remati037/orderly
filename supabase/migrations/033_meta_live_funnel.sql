-- =============================================================
-- Orderly — leads and landing page views on ad_insights_daily
--
-- Lead campaigns have no purchases by design, and landing page views complete
-- the funnel /reklame shows per account.
-- =============================================================

ALTER TABLE ad_insights_daily
  ADD COLUMN IF NOT EXISTS leads              INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landing_page_views INTEGER NOT NULL DEFAULT 0;
