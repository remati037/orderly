-- =============================================================
-- Orderly — Stripe as a first-class platform
--
-- A Stripe site is one where payments happen directly on Stripe (e.g. a Circle
-- community's checkout, which charges through the owner's connected Stripe
-- account). Orders arrive via a Stripe webhook, not a WooCommerce/Thinkific push.
--
-- Credentials reuse the existing site columns:
--   consumer_key    = Stripe secret key      (sk_live_… / sk_test_…)
--   consumer_secret = webhook signing secret (whsec_…)
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- ── Convert any legacy 'circle' rows to 'stripe' ─────────────────────────────
-- A Circle community charges through the owner's Stripe account, and Circle's
-- own API needs a pricier plan, so we ingest its orders via the Stripe webhook.
-- The integration mechanism is Stripe; the platform value must reflect that.
--
-- Order matters: drop the old constraints FIRST. The existing check allows
-- 'circle' but not 'stripe', so converting the row before the drop trips the
-- old constraint (the SQL editor runs the whole script in one transaction).
ALTER TABLE public.sites  DROP CONSTRAINT IF EXISTS sites_platform_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_check;

UPDATE public.sites  SET platform = 'stripe' WHERE platform = 'circle';
UPDATE public.orders SET source   = 'stripe' WHERE source   = 'circle';

-- ── Allow the new platform / source values ───────────────────────────────────
ALTER TABLE public.sites  ADD CONSTRAINT sites_platform_check
  CHECK (platform IN ('woocommerce','thinkific','stripe'));

ALTER TABLE public.orders ADD CONSTRAINT orders_source_check
  CHECK (source IN ('woocommerce','thinkific','stripe'));

-- ── Real processor fee (Stripe balance_transaction.fee), in the order currency.
-- Lets profit use the actual fee instead of a flat 5% estimate. Kept out of the
-- browser like the other financial columns.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS processor_fee DECIMAL(12,2);
REVOKE SELECT (processor_fee) ON public.orders FROM anon, authenticated;
