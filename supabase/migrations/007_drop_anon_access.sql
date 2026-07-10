-- =============================================================
-- Orderly — SECURITY: remove all `anon` read access
--
-- ⚠️  RUN THIS LAST. Only after:
--       1. Clerk is registered in Supabase → Authentication → Third-Party Auth
--       2. Clerk session token carries the claim  role: "authenticated"
--       3. The deployed app reads data successfully (live feed + /tv work)
--
--     Until then the browser still authenticates as `anon`, and running this
--     migration will make the dashboard and /tv show no data.
--
-- Why: NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the JS bundle, so `anon` means
-- "anyone on the internet". These policies were exposing every order — totals,
-- customer names and cities — to the public. /tv was the only thing that needed
-- them; it now requires a login, so `anon` needs nothing at all.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- ── Drop the anon read policies ──────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_read_orders"       ON public.orders;
DROP POLICY IF EXISTS "realtime_orders_read"   ON public.orders;
DROP POLICY IF EXISTS "Enable read for anon"   ON public.order_items;
DROP POLICY IF EXISTS "Enable read for anon"   ON public.sites;

-- ── Revoke the underlying grants too (policies alone are not the boundary) ───
REVOKE SELECT ON public.orders      FROM anon;
REVOKE SELECT ON public.order_items FROM anon;
REVOKE SELECT ON public.sites       FROM anon;
REVOKE SELECT ON public.settings    FROM anon;

-- ── Belt and braces: no future table grants anon anything ────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon;

-- =============================================================
-- Verify (both should return zero rows):
--
--   select tablename, policyname, roles from pg_policies
--   where schemaname = 'public' and 'anon' = any(roles);
--
--   select table_name, column_name from information_schema.column_privileges
--   where grantee = 'anon' and table_schema = 'public';
-- =============================================================
