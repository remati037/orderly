-- =============================================================
-- Orderly — link subscriptions to their Stripe subscription id
--
-- Lets the Stripe subscription sync upsert idempotently instead of duplicating
-- rows on every run. mrr is stored in the base currency (EUR) at sync time.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_stripe_id
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Keep these server-only, like the other financial tables.
REVOKE SELECT ON public.subscriptions FROM anon, authenticated;
