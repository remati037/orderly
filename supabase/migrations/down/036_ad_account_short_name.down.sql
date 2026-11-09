-- Reverses 036_ad_account_short_name.sql.
ALTER TABLE ad_accounts DROP COLUMN IF EXISTS short_name;
