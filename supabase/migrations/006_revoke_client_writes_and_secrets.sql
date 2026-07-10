-- =============================================================
-- Orderly — SECURITY: defense in depth for the client-side roles
--
-- Two changes:
--
-- 1. Revoke write privileges from `anon` and `authenticated`.
--    Supabase grants every privilege on the public schema to both roles by
--    default; today only the absence of an RLS write policy stops a stranger
--    with the anon key from writing. That is a single layer. The browser
--    client never writes (verified: it only calls .from().select() and
--    .channel()) — every write goes through an API route using service_role.
--
-- 2. Keep secrets out of reach of `authenticated` too.
--    Clerk users are currently `anon`, so the `authenticated_read_all`
--    policies never fire. The moment Clerk is wired to Supabase auth they
--    would, and an `agent` could read store credentials and the Facebook
--    access token. Lock those columns now.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- ── 1. No writes from the browser-facing roles ───────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- Same for any table created later.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES FROM anon, authenticated;

-- ── 2a. sites: hide store API credentials from `authenticated` as well ───────
REVOKE SELECT ON public.sites FROM authenticated;
GRANT  SELECT (id, name, color_hex, is_active, platform, created_at)
  ON public.sites TO authenticated;

-- ── 2b. ad_accounts: the Meta access_token must never leave the server ───────
DROP POLICY IF EXISTS "authenticated_read_all" ON public.ad_accounts;
REVOKE SELECT ON public.ad_accounts FROM anon, authenticated;

-- ── 2c. orders / order_items: mirror the anon column limits for authenticated ─
REVOKE SELECT ON public.orders FROM authenticated;
GRANT  SELECT (id, site_id, woo_order_id, source, status, total, currency,
               customer_name, customer_city, product_type, payment_type,
               created_at, updated_at)
  ON public.orders TO authenticated;

REVOKE SELECT ON public.order_items FROM authenticated;
GRANT  SELECT (id, order_id, product_name, product_type, quantity, created_at)
  ON public.order_items TO authenticated;
