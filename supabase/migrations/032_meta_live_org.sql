-- =============================================================
-- Orderly — org_id on the Meta live tables from 031
--
-- Every public table carries org_id (022). Existing rows belong to the default
-- org; access stays service-role only, so no policy changes.
-- =============================================================

ALTER TABLE ad_insights_daily
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES organizations(id);
ALTER TABLE ad_recommendations
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES organizations(id);
ALTER TABLE meta_alerts_sent
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES organizations(id);
ALTER TABLE service_secrets
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES organizations(id);
