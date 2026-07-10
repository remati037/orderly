-- =============================================================
-- Orderly — Team members & roles (RBAC)
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- role: 'owner' sees everything (finances, ads, settings).
--       'agent' sees only the payment-recovery pipeline.
CREATE TABLE IF NOT EXISTS team_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id  TEXT UNIQUE,              -- NULL until the invited person first signs in
  email          TEXT NOT NULL,
  name           TEXT,
  role           TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'agent')),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Reads/writes go through the service role in API routes; no direct client access.
CREATE POLICY "service_role_all" ON team_members FOR ALL TO service_role USING (true);

CREATE INDEX IF NOT EXISTS idx_team_members_clerk ON team_members(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(lower(email));
