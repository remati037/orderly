-- =============================================================
-- Orderly — read-only customer lookup for Support Hub
--
-- GET /api/support/customer (app/api/support/customer/route.ts) calls this one
-- function. It only reads, and it is the single place where the lookup is
-- fenced in: everything is filtered by the caller's org_id AND the requested
-- site ids, so another org's or another site's orders can never leak out
-- (most Orderly routes still don't filter by org_id; this one must).
--
-- Returns raw rows; statuses, LTV and links are computed in lib/support/.
--   customer       {id, email, name} | null
--   orders         every order of that customer on the sites, newest first
--                  (trash excluded), with paid_at and Woo line items (for Circle)
--   subscriptions  the customer's subscriptions on the sites
--   circle_grants  Circle grants made for those orders
--   open_recovery  an open Naplata card (same 30-day window as the board)
--
-- Only service_role may execute it (the route uses the service key).
-- =============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.support_customer_lookup(p_org UUID, p_email TEXT, p_site_ids UUID[])
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH c AS (
    SELECT id, email, name
      FROM customers
     WHERE org_id = p_org AND email = normalize_email(p_email)
  ),
  o AS (
    SELECT o.id, o.site_id, s.name AS site_name, o.source, o.status, o.woo_order_id,
           o.total, o.refunded_total, o.currency, o.created_at,
           CASE WHEN o.status IN ('completed', 'processing', 'refunded') THEN
             coalesce(
               CASE WHEN o.source = 'woocommerce'
                     AND o.woo_data ->> 'date_paid_gmt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
                    THEN (o.woo_data ->> 'date_paid_gmt')::TIMESTAMP AT TIME ZONE 'UTC' END,
               CASE WHEN o.source = 'stripe' AND o.woo_data ->> 'created' ~ '^\d{9,11}$'
                    THEN to_timestamp((o.woo_data ->> 'created')::BIGINT) END,
               o.created_at)
           END AS paid_at,
           CASE WHEN jsonb_typeof(o.woo_data -> 'line_items') = 'array' THEN
             (SELECT coalesce(jsonb_agg(jsonb_build_object('product_id', (li ->> 'product_id')::BIGINT,
                                                           'name', li ->> 'name')), '[]'::JSONB)
                FROM jsonb_array_elements(o.woo_data -> 'line_items') li
               WHERE li ->> 'product_id' ~ '^\d{1,18}$')
           ELSE '[]'::JSONB END AS line_items
      FROM orders o
      JOIN c ON o.customer_id = c.id
      JOIN sites s ON s.id = o.site_id AND s.org_id = p_org
     WHERE o.org_id = p_org
       AND o.site_id = ANY (p_site_ids)
       AND o.status <> 'trash'
  )
  SELECT jsonb_build_object(
    'customer', (SELECT to_jsonb(c) FROM c),
    'orders', coalesce((
      SELECT jsonb_agg(
               to_jsonb(o) || jsonb_build_object('products', coalesce((
                 SELECT jsonb_agg(jsonb_build_object('name', i.product_name, 'quantity', coalesce(i.quantity, 0))
                                  ORDER BY i.created_at, i.id)
                   FROM order_items i WHERE i.order_id = o.id), '[]'::JSONB))
               ORDER BY o.created_at DESC, o.id)
        FROM o), '[]'::JSONB),
    'subscriptions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', sb.id, 'site_id', sb.site_id, 'product_name', sb.product_name, 'status', sb.status,
               'mrr', sb.mrr, 'mrr_amount', sb.mrr_amount, 'mrr_currency', sb.mrr_currency,
               'next_billing_at', sb.next_billing_at, 'cancelled_at', sb.cancelled_at)
               ORDER BY sb.started_at DESC NULLS LAST, sb.id)
        FROM subscriptions sb
        JOIN c ON sb.customer_id = c.id
       WHERE sb.org_id = p_org AND sb.site_id = ANY (p_site_ids)), '[]'::JSONB),
    'circle_grants', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'order_id', g.order_id, 'access_group_id', g.access_group_id, 'status', g.status,
               'last_error', g.last_error, 'granted_at', g.granted_at)
               ORDER BY o.created_at, g.access_group_id)
        FROM circle_grants g
        JOIN o ON o.id = g.order_id
       WHERE g.org_id = p_org), '[]'::JSONB),
    'open_recovery', EXISTS (
      SELECT 1
        FROM recovery_tasks t
        JOIN o ON o.id = t.order_id
       WHERE t.org_id = p_org
         AND t.stage IN ('novo', 'kontaktiran', 'ceka_uplatu')
         AND o.created_at >= NOW() - INTERVAL '30 days')
  )
$$;

REVOKE ALL ON FUNCTION public.support_customer_lookup(UUID, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_customer_lookup(UUID, TEXT, UUID[]) TO service_role;
