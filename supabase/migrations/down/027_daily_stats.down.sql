-- Reverses 027_daily_stats.sql. The table is derived data; re-applying rebuilds it.
SET lock_timeout = '5s';
DROP TRIGGER IF EXISTS trg_daily_stats_on_order  ON public.orders;
DROP TRIGGER IF EXISTS trg_daily_stats_on_refund ON public.refunds;
DROP FUNCTION IF EXISTS public.daily_stats_on_order();
DROP FUNCTION IF EXISTS public.daily_stats_on_refund();
DROP FUNCTION IF EXISTS public.rebuild_daily_stats(DATE, DATE);
DROP FUNCTION IF EXISTS public.refresh_daily_stats(UUID, DATE);
DROP FUNCTION IF EXISTS public.org_day(UUID, TIMESTAMPTZ);
DROP TABLE IF EXISTS public.daily_stats;
