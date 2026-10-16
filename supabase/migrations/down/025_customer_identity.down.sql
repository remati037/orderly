-- Reverses the schema of 025_customer_identity.sql. The data part (merged
-- duplicates, lower-cased emails, filled customer_id) is not undone: merged
-- rows can't be split back, and the old values carried no information.
SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_customers_adopt_orders    ON public.customers;
DROP TRIGGER IF EXISTS trg_customers_normalize_email ON public.customers;
DROP TRIGGER IF EXISTS trg_orders_link_customer      ON public.orders;
DROP FUNCTION IF EXISTS public.customers_adopt_orders();
DROP FUNCTION IF EXISTS public.customers_normalize_email();
DROP FUNCTION IF EXISTS public.orders_link_customer();

-- Back to 023's version, which doesn't touch customers.
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

DROP FUNCTION IF EXISTS public.refresh_all_customer_totals();
DROP FUNCTION IF EXISTS public.refresh_customer_totals(TEXT);
DROP FUNCTION IF EXISTS public.fx_rate(TEXT);
DROP FUNCTION IF EXISTS public.normalize_email(TEXT);
DROP INDEX IF EXISTS public.idx_orders_customer_id;
