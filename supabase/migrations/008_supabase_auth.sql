-- =============================================================
-- Orderly — switch team_members from Clerk IDs to Supabase Auth
--
-- Clerk is being removed. Users now live in auth.users (create them in
-- Supabase Dashboard → Authentication → Users). team_members keeps the
-- role, keyed by auth.users.id and matched by email on first sign-in.
--
-- The old clerk_user_id values are meaningless now, so the column is
-- dropped rather than migrated.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

ALTER TABLE public.team_members DROP COLUMN IF EXISTS clerk_user_id;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE
  REFERENCES auth.users(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_team_members_clerk;
CREATE INDEX IF NOT EXISTS idx_team_members_auth ON public.team_members(auth_user_id);
