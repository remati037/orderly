-- =============================================================
-- Orderly — fix the subscriptions upsert conflict target
--
-- Migration 012 created a PARTIAL unique index (WHERE ... IS NOT NULL).
-- PostgREST's upsert can't use a partial index as an ON CONFLICT target, so the
-- Stripe subscription import failed with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT ..."
--
-- Replace it with a plain UNIQUE constraint. Postgres allows multiple NULLs in a
-- UNIQUE constraint, so non-Stripe subscription rows (NULL id) still coexist.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

DROP INDEX IF EXISTS uq_subscriptions_stripe_id;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS uq_subscriptions_stripe_id;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT uq_subscriptions_stripe_id UNIQUE (stripe_subscription_id);
