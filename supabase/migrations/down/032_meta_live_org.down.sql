-- Reverses 032_meta_live_org.sql.
ALTER TABLE ad_insights_daily  DROP COLUMN IF EXISTS org_id;
ALTER TABLE ad_recommendations DROP COLUMN IF EXISTS org_id;
ALTER TABLE meta_alerts_sent   DROP COLUMN IF EXISTS org_id;
ALTER TABLE service_secrets    DROP COLUMN IF EXISTS org_id;
