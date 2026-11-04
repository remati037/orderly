-- Reverses 031_meta_live.sql.
DELETE FROM settings WHERE key = 'meta_live';
ALTER TABLE ad_accounts
  DROP COLUMN IF EXISTS meta_account_status,
  DROP COLUMN IF EXISTS live_synced_at,
  DROP COLUMN IF EXISTS live_sync_error;
DROP TABLE IF EXISTS service_secrets;
DROP TABLE IF EXISTS meta_alerts_sent;
DROP TABLE IF EXISTS ad_recommendations;
DROP TABLE IF EXISTS ad_insights_daily;
