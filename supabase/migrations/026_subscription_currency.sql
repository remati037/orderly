-- =============================================================
-- Orderly — subscriptions keep their own currency
--
-- subscriptions.mrr was converted to the base currency once, at sync time, so
-- it silently kept whatever rate applied then (Thinkific stored USD as is).
-- The monthly amount is now stored as charged (mrr_amount + mrr_currency) and
-- converted when read, with the current rates (lib/metrics/mrr.ts).
-- mrr stays as the base-currency value for older readers.
--
-- Filled by the next Stripe subscription sync (daily cron, or the import
-- button); rows not synced yet fall back to mrr in the base currency.
-- =============================================================

SET lock_timeout = '5s';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS mrr_amount   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS mrr_currency TEXT;
