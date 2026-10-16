-- =============================================================
-- Orderly — daily_stats: per org / site / day / currency aggregates
--
-- Reports and the dashboard read these instead of scanning raw orders, which
-- is what keeps them fast with many stores. Amounts stay in the order's own
-- currency; conversion happens when read, with the current rates.
--
--   day        the org's local calendar day (organizations.timezone)
--   orders     paid orders created that day (completed, processing, refunded)
--   gross      their totals
--   refunds    refunds made that day (by refund date, like Metorik)
--   net        gross − refunds  (net revenue)
--   net_profit their stored profit, minus the profit share of that day's refunds
--   fees       processor fees (real Stripe fee, else the 5% card estimate)
--
-- Kept by triggers on orders and refunds. The trigger catches its own errors:
-- a stats problem must never make a webhook lose an order. The nightly
-- consistency check (and refresh_daily_stats) repairs any day that drifted.
-- =============================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.daily_stats (
  org_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                 REFERENCES public.organizations(id),
  site_id      UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  currency     TEXT NOT NULL,
  orders       INTEGER NOT NULL DEFAULT 0,
  gross        NUMERIC(14,2) NOT NULL DEFAULT 0,
  refunds      NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_count INTEGER NOT NULL DEFAULT 0,
  net          NUMERIC(14,2) GENERATED ALWAYS AS (gross - refunds) STORED,
  net_profit   NUMERIC(14,2) NOT NULL DEFAULT 0,
  fees         NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, day, currency)
);
CREATE INDEX IF NOT EXISTS idx_daily_stats_org_day ON public.daily_stats (org_id, day);

CREATE OR REPLACE FUNCTION public.org_day(p_org UUID, ts TIMESTAMPTZ)
RETURNS DATE LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (ts AT TIME ZONE coalesce(
           (SELECT timezone FROM organizations WHERE id = p_org), 'Europe/Belgrade'))::DATE
$$;

-- Recompute one site-day from scratch (all currencies). Idempotent.
CREATE OR REPLACE FUNCTION public.refresh_daily_stats(p_site UUID, p_day DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org  UUID;
  v_from TIMESTAMPTZ;
  v_to   TIMESTAMPTZ;
  tz     TEXT;
BEGIN
  SELECT s.org_id, coalesce(o.timezone, 'Europe/Belgrade') INTO v_org, tz
    FROM sites s LEFT JOIN organizations o ON o.id = s.org_id WHERE s.id = p_site;
  IF v_org IS NULL THEN RETURN; END IF;
  v_from := p_day::TIMESTAMP AT TIME ZONE tz;
  v_to   := (p_day + 1)::TIMESTAMP AT TIME ZONE tz;

  DELETE FROM daily_stats WHERE site_id = p_site AND day = p_day;

  INSERT INTO daily_stats (org_id, site_id, day, currency, orders, gross, refunds, refund_count, net_profit, fees)
  SELECT v_org, p_site, p_day, cur,
         sum(n)::INT, sum(g), sum(r), sum(rc)::INT, sum(p), sum(f)
    FROM (
      SELECT coalesce(o.currency, 'RSD') AS cur, count(*) AS n, sum(o.total) AS g,
             0::NUMERIC AS r, 0 AS rc, sum(coalesce(o.net_profit, 0)) AS p,
             sum(coalesce(o.processor_fee,
                          CASE WHEN o.payment_method ~* 'stripe' THEN o.total * 0.05 ELSE 0 END)) AS f
        FROM orders o
       WHERE o.site_id = p_site AND o.created_at >= v_from AND o.created_at < v_to
         AND o.status IN ('completed','processing','refunded')
       GROUP BY 1
      UNION ALL
      SELECT r.currency, 0, 0, sum(r.amount), count(*),
             -sum(CASE WHEN o.total > 0 THEN r.amount * coalesce(o.net_profit, 0) / o.total ELSE 0 END),
             0
        FROM refunds r JOIN orders o ON o.id = r.order_id
       WHERE r.site_id = p_site AND r.refunded_at >= v_from AND r.refunded_at < v_to
       GROUP BY 1
    ) x
   GROUP BY cur;
END;
$$;

CREATE OR REPLACE FUNCTION public.daily_stats_on_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d DATE;
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.total IS NOT DISTINCT FROM OLD.total
       AND NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
       AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id
       AND NEW.net_profit IS NOT DISTINCT FROM OLD.net_profit
       AND NEW.processor_fee IS NOT DISTINCT FROM OLD.processor_fee
       AND NEW.payment_method IS NOT DISTINCT FROM OLD.payment_method THEN
      RETURN NULL;
    END IF;

    IF TG_OP <> 'INSERT' THEN
      PERFORM refresh_daily_stats(OLD.site_id, org_day(OLD.org_id, OLD.created_at));
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM refresh_daily_stats(NEW.site_id, org_day(NEW.org_id, NEW.created_at));
      -- The profit share of this order's refunds lives on the refund days.
      IF TG_OP = 'UPDATE' AND (NEW.net_profit IS DISTINCT FROM OLD.net_profit
                               OR NEW.total IS DISTINCT FROM OLD.total) THEN
        FOR d IN SELECT DISTINCT org_day(NEW.org_id, refunded_at) FROM refunds WHERE order_id = NEW.id LOOP
          PERFORM refresh_daily_stats(NEW.site_id, d);
        END LOOP;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'daily_stats_on_order failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_stats_on_order ON public.orders;
CREATE TRIGGER trg_daily_stats_on_order
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.daily_stats_on_order();

CREATE OR REPLACE FUNCTION public.daily_stats_on_refund()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP <> 'INSERT' THEN
      PERFORM refresh_daily_stats(OLD.site_id, org_day(OLD.org_id, OLD.refunded_at));
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM refresh_daily_stats(NEW.site_id, org_day(NEW.org_id, NEW.refunded_at));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'daily_stats_on_refund failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_stats_on_refund ON public.refunds;
CREATE TRIGGER trg_daily_stats_on_refund
AFTER INSERT OR UPDATE OR DELETE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.daily_stats_on_refund();

-- Rebuild a whole range (or everything). Returns how many site-days it wrote.
CREATE OR REPLACE FUNCTION public.rebuild_daily_stats(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT site_id, org_day(org_id, created_at) AS d FROM orders
     WHERE status IN ('completed','processing','refunded')
    UNION
    SELECT DISTINCT site_id, org_day(org_id, refunded_at) FROM refunds
    UNION
    SELECT site_id, day FROM daily_stats
  LOOP
    CONTINUE WHEN (p_from IS NOT NULL AND r.d < p_from) OR (p_to IS NOT NULL AND r.d > p_to);
    PERFORM refresh_daily_stats(r.site_id, r.d);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON public.daily_stats;
CREATE POLICY "service_role_all" ON public.daily_stats FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "org_read" ON public.daily_stats;
CREATE POLICY "org_read" ON public.daily_stats FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
REVOKE ALL ON public.daily_stats FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.daily_stats FROM authenticated;

REVOKE ALL ON FUNCTION public.refresh_daily_stats(UUID, DATE)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_daily_stats(DATE, DATE)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.daily_stats_on_order()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.daily_stats_on_refund()          FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_daily_stats(DATE, DATE) TO service_role;

SELECT public.rebuild_daily_stats();
