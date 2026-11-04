-- Reverses 033_meta_live_funnel.sql.
ALTER TABLE ad_insights_daily
  DROP COLUMN IF EXISTS leads,
  DROP COLUMN IF EXISTS landing_page_views;
