-- =============================================================
-- Orderly — SECURITY: revoke every remaining `anon` SELECT grant
--
-- Migration 007 removed anon access to orders / order_items / sites / settings.
-- Supabase's default `GRANT SELECT ON ALL TABLES ... TO anon` still covered the
-- rest: customers, products, subscriptions, sync_log, sound_settings,
-- team_members.
--
-- Those are not leaking today — RLS is enabled on each and none of them has an
-- `anon` policy, so reads are denied. But that leaves a single layer: one
-- accidental anon policy on `customers` would publish every customer email.
-- The browser authenticates with Supabase Auth now, so `anon` needs nothing.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;

-- Future tables too (007 already set this, repeated here so this file stands alone).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon;

-- =============================================================
-- Verify — both should return zero rows:
--
--   select table_name, column_name from information_schema.column_privileges
--   where grantee = 'anon' and table_schema = 'public';
--
--   select tablename, policyname, roles from pg_policies
--   where schemaname = 'public' and 'anon' = any(roles);
-- =============================================================
