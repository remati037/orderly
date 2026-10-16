-- =============================================================
-- Orderly — one customer per email
--
-- Emails were stored as typed ("Marko@Gmail.com " and "marko@gmail.com" were two
-- customers) and orders.customer_id was never filled. Now:
--   1. duplicate customers (same email ignoring case/spaces) are merged into the
--      oldest row; their stored totals are added up, so the ~4.7k customers
--      whose orders no longer exist keep their history (see 015 / 017),
--   2. emails are lower-cased in customers and orders,
--   3. orders.customer_id points at the customer,
--   4. triggers keep all of that true for every future write, whichever code
--      path (webhook, cron, manual, Stripe import) does it.
--
-- Customer totals get one definition, refresh_customer_totals(): net of
-- refunds, base currency, only for customers that still have orders.
-- =============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.normalize_email(e TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(lower(btrim(e)), '')
$$;

-- Multiplier from `cur` to the base currency. Same defaults as lib/utils/fx.ts.
CREATE OR REPLACE FUNCTION public.fx_rate(cur TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT CASE
           WHEN coalesce(cur, 'RSD') = cfg.base THEN 1
           ELSE coalesce((cfg.rates ->> coalesce(cur, 'RSD'))::NUMERIC, 1)
         END
    FROM (SELECT
            coalesce((SELECT value FROM settings WHERE key = 'exchange_rates'),
                     '{"EUR": 1, "RSD": 0.00855, "USD": 0.92}'::JSONB) AS rates,
            coalesce((SELECT value #>> '{}' FROM settings WHERE key = 'base_currency'), 'EUR') AS base
         ) cfg
$$;

-- ── 1. Merge duplicates ──────────────────────────────────────────────────────
CREATE TEMP TABLE customer_merge ON COMMIT DROP AS
SELECT c.id AS loser_id, k.id AS keeper_id
  FROM public.customers c
  JOIN LATERAL (
    SELECT k.id FROM public.customers k
     WHERE normalize_email(k.email) = normalize_email(c.email)
     ORDER BY k.created_at, k.id
     LIMIT 1
  ) k ON k.id <> c.id;

UPDATE public.customers k
   SET total_spent    = k.total_spent + a.total_spent,
       net_spent      = coalesce(k.net_spent, 0) + a.net_spent,
       order_count    = k.order_count + a.order_count,
       first_order_at = least(k.first_order_at, a.first_order_at),
       last_order_at  = greatest(k.last_order_at, a.last_order_at),
       name           = coalesce(nullif(k.name, ''), a.name),
       city           = coalesce(nullif(k.city, ''), a.city)
  FROM (
    SELECT m.keeper_id,
           sum(coalesce(c.total_spent, 0)) AS total_spent,
           sum(coalesce(c.net_spent, 0))   AS net_spent,
           sum(coalesce(c.order_count, 0)) AS order_count,
           min(c.first_order_at)           AS first_order_at,
           max(c.last_order_at)            AS last_order_at,
           max(nullif(c.name, ''))         AS name,
           max(nullif(c.city, ''))         AS city
      FROM customer_merge m JOIN public.customers c ON c.id = m.loser_id
     GROUP BY m.keeper_id
  ) a
 WHERE k.id = a.keeper_id;

UPDATE public.subscriptions s SET customer_id = m.keeper_id
  FROM customer_merge m WHERE s.customer_id = m.loser_id;
UPDATE public.orders o SET customer_id = m.keeper_id
  FROM customer_merge m WHERE o.customer_id = m.loser_id;
DELETE FROM public.customers c USING customer_merge m WHERE c.id = m.loser_id;

-- ── 2. Normalize stored emails ───────────────────────────────────────────────
UPDATE public.customers SET email = normalize_email(email)
 WHERE email IS DISTINCT FROM normalize_email(email) AND normalize_email(email) IS NOT NULL;
UPDATE public.orders SET customer_email = normalize_email(customer_email)
 WHERE customer_email IS DISTINCT FROM normalize_email(customer_email);

-- idx_orders_customer_email exists since 001.
CREATE INDEX IF NOT EXISTS idx_orders_customer_id    ON public.orders (customer_id);

-- ── 3. Link orders to customers ──────────────────────────────────────────────
UPDATE public.orders o SET customer_id = c.id
  FROM public.customers c
 WHERE c.email = o.customer_email AND o.customer_id IS DISTINCT FROM c.id;

-- ── 4. Keep it that way ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.customers_normalize_email()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email := normalize_email(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_normalize_email ON public.customers;
CREATE TRIGGER trg_customers_normalize_email
BEFORE INSERT OR UPDATE OF email ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.customers_normalize_email();

CREATE OR REPLACE FUNCTION public.orders_link_customer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.customer_email := normalize_email(NEW.customer_email);
  IF TG_OP = 'INSERT' OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
     OR NEW.customer_id IS NULL THEN
    NEW.customer_id := (SELECT id FROM customers WHERE email = NEW.customer_email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_link_customer ON public.orders;
CREATE TRIGGER trg_orders_link_customer
BEFORE INSERT OR UPDATE OF customer_email, customer_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_link_customer();

-- An order usually lands before its customer row (the webhook upserts the
-- order first), so a new customer adopts the orders already waiting for it.
CREATE OR REPLACE FUNCTION public.customers_adopt_orders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE orders SET customer_id = NEW.id
   WHERE customer_email = NEW.email AND customer_id IS DISTINCT FROM NEW.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_adopt_orders ON public.customers;
CREATE TRIGGER trg_customers_adopt_orders
AFTER INSERT OR UPDATE OF email ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.customers_adopt_orders();

-- ── 5. Customer totals: one definition ───────────────────────────────────────
-- total_spent = what the customer paid and kept (net of refunds), in the base
-- currency. A fully refunded order adds 0 and doesn't count as an order.
-- Customers without any order row keep their stored history.
CREATE OR REPLACE FUNCTION public.refresh_customer_totals(p_email TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e TEXT := normalize_email(p_email);
BEGIN
  IF e IS NULL OR NOT EXISTS (SELECT 1 FROM orders WHERE customer_email = e) THEN RETURN; END IF;

  UPDATE customers c
     SET order_count    = a.n,
         total_spent    = a.net,
         first_order_at = coalesce(a.first_at, c.first_order_at),
         last_order_at  = coalesce(a.last_at, c.last_order_at)
    FROM (
      SELECT count(*) FILTER (WHERE status IN ('completed','processing'))           AS n,
             round(coalesce(sum((total - refunded_total) * fx_rate(currency)), 0), 2) AS net,
             min(created_at) FILTER (WHERE status IN ('completed','processing'))    AS first_at,
             max(created_at) FILTER (WHERE status IN ('completed','processing'))    AS last_at
        FROM orders
       WHERE customer_email = e AND status IN ('completed','processing','refunded')
    ) a
   WHERE c.email = e;
END;
$$;

-- Every customer that has orders, e.g. after the refunds backfill.
CREATE OR REPLACE FUNCTION public.refresh_all_customer_totals()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e TEXT; n INTEGER := 0;
BEGIN
  FOR e IN SELECT DISTINCT customer_email FROM orders WHERE customer_email IS NOT NULL LOOP
    PERFORM refresh_customer_totals(e);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- A refund changes what the customer spent.
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
    PERFORM refresh_customer_totals((SELECT customer_email FROM orders WHERE id = oid));
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_customer_totals(TEXT)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_all_customer_totals()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_link_customer()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customers_adopt_orders()       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_customer_totals(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_all_customer_totals() TO service_role;
