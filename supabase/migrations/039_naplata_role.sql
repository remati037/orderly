-- =============================================================
-- Orderly — 'naplata' role
-- Run in: Supabase Dashboard → SQL Editor → Run
--
-- role: 'naplata' sees only the Naplata tab (payment recovery, processing
--       calls, SMS) — no Porudžbine, Black Friday or Reklame like 'agent'.
-- =============================================================

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_check CHECK (role IN ('owner', 'agent', 'naplata'));
