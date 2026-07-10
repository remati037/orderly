-- =============================================================
-- Orderly — SECURITY: restrict what the public anon key can read
--
-- Context: NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the browser bundle, so the
-- `anon` role is effectively "anyone on the internet". RLS is row-level only —
-- it does not restrict columns — and Supabase grants anon SELECT on every
-- column by default. The existing anon SELECT policies therefore exposed:
--
--   sites.consumer_key / consumer_secret / thinkific_api_key  (store API creds)
--   orders.woo_data                                           (full billing payload: phone, address)
--   orders.net_profit / customer_email                        (margins, PII)
--   order_items.price / cost                                  (COGS, margins)
--
-- This migration keeps the anon policies (the public /tv board and the realtime
-- live feed depend on them) but narrows anon to display-only columns.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- ── sites: only what /tv needs to label and colour a store ───────────────────
REVOKE SELECT ON public.sites FROM anon;
GRANT  SELECT (id, name, color_hex, is_active, platform, created_at)
  ON public.sites TO anon;

-- ── orders: drop woo_data, net_profit, customer_email, payment_method ─────────
REVOKE SELECT ON public.orders FROM anon;
GRANT  SELECT (id, site_id, woo_order_id, source, status, total, currency,
               customer_name, customer_city, product_type, payment_type,
               created_at, updated_at)
  ON public.orders TO anon;

-- ── order_items: drop price and cost ─────────────────────────────────────────
REVOKE SELECT ON public.order_items FROM anon;
GRANT  SELECT (id, order_id, product_name, product_type, quantity, created_at)
  ON public.order_items TO anon;
