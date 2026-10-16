-- =============================================================
-- Orderly — refunds
--
-- Revenue used to ignore refunds entirely: a partly refunded order counted in
-- full, and a refund never lowered the month it happened in. Refunds now live
-- in their own table (one row per Woo refund / Stripe refund), keyed by the
-- platform's id so webhook redeliveries, cron and backfill are idempotent.
--
-- orders.refunded_total is the per-order sum, kept by trigger, for per-order
-- views (customer LTV, products, cohorts). Revenue by period subtracts refunds
-- by refunded_at instead — see lib/metrics.
--
-- Schema only; history is filled by `npm run refunds:backfill`.
-- =============================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.refunds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                REFERENCES public.organizations(id),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('woocommerce','stripe','manual')),
  external_id TEXT NOT NULL,              -- Woo refund id / Stripe re_…
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency    TEXT NOT NULL,
  reason      TEXT,
  refunded_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_refunds_order    ON public.refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_refunded ON public.refunds (org_id, refunded_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_site     ON public.refunds (site_id, refunded_at DESC);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_total NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Keep orders.refunded_total equal to the sum of its refunds. Only touches the
-- one order row, and only when the value actually changes.
CREATE OR REPLACE FUNCTION public.refunds_sync_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE oid UUID;
BEGIN
  FOREACH oid IN ARRAY ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.order_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.order_id END
  ] LOOP
    CONTINUE WHEN oid IS NULL;
    UPDATE orders o
       SET refunded_total = s.total
      FROM (SELECT coalesce(sum(amount), 0) AS total FROM refunds WHERE order_id = oid) s
     WHERE o.id = oid AND o.refunded_total IS DISTINCT FROM s.total;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refunds_sync_order_total ON public.refunds;
CREATE TRIGGER trg_refunds_sync_order_total
AFTER INSERT OR UPDATE OR DELETE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.refunds_sync_order_total();

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON public.refunds;
CREATE POLICY "service_role_all" ON public.refunds FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "org_read" ON public.refunds;
CREATE POLICY "org_read" ON public.refunds FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
REVOKE ALL ON public.refunds FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.refunds FROM authenticated;
REVOKE ALL ON FUNCTION public.refunds_sync_order_total() FROM PUBLIC, anon, authenticated;
