-- Reverses 034_ad_account_site.sql. Campaign links it filled in stay, they can be
-- told apart from manual ones only by updated_at.
ALTER TABLE ad_accounts DROP COLUMN IF EXISTS site_id;
