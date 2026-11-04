-- =============================================================
-- Orderly — which site each ad account pays for
--
-- A campaign with no site of its own takes its account's site, now and whenever
-- a new one appears in the sync. Campaigns already linked keep their link, so a
-- campaign that sells another site's product can still say so.
-- =============================================================

ALTER TABLE ad_accounts
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

UPDATE ad_accounts a SET site_id = s.id
  FROM sites s
 WHERE (a.fb_account_id, s.name) IN (
   ('act_801333736942099',  'AI Profit Lab'),
   ('act_2086098642234034', 'Nemanja Antic'),
   ('act_991802819428042',  'FIlip Ćirić'),
   ('act_2507690192715834', 'Biznis priče')
 );

UPDATE ad_campaign_map m SET site_id = a.site_id, updated_at = NOW()
  FROM ad_accounts a
 WHERE a.id = m.ad_account_id AND m.site_id IS NULL AND a.site_id IS NOT NULL;
