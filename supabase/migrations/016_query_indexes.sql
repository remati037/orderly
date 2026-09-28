-- =============================================================
-- Orderly — indexes for the queries the dashboard actually runs
--
-- Every KPI/chart filters orders by status + created_at range (often per
-- site); product filters/top-products group order_items by product_name;
-- /api/sites reads the latest sync_log row per site.
-- idx_customers_email duplicated the UNIQUE constraint's own index.
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_orders_status_created   ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_site_created     ON public.orders (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_product     ON public.order_items (product_name);
CREATE INDEX IF NOT EXISTS idx_sync_log_site_created   ON public.sync_log (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer  ON public.subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_site_prod ON public.subscriptions (site_id, product_name);

DROP INDEX IF EXISTS public.idx_customers_email;
