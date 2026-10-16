-- Reverses 023_refunds.sql. Refund history is lost; re-run refunds:backfill after re-applying.
SET lock_timeout = '5s';
DROP TABLE IF EXISTS public.refunds;
DROP FUNCTION IF EXISTS public.refunds_sync_order_total();
ALTER TABLE public.orders DROP COLUMN IF EXISTS refunded_total;
