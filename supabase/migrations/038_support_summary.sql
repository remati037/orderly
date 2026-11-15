-- =============================================================
-- Orderly — read-only LTV summary for Support Hub's contact list
--
-- POST /api/support/customers/summary calls this one function: for up to 500
-- emails and the requested sites, one row per (email, site) where the customer
-- has at least one paid order they kept. Same rules as the customer card
-- (037 + lib/support/customer.ts):
--   total_spent    paid orders (completed, processing, refunded), net of
--                  refunds, in the base currency (fx_rate, migration 025)
--   orders_count   paid orders not fully refunded
--   last_order_at  newest of those
-- Fenced to the caller's org_id and the requested sites. Only service_role may
-- execute it.
-- =============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.support_customers_summary(p_org UUID, p_emails TEXT[], p_site_ids UUID[])
RETURNS TABLE (email TEXT, site_id UUID, total_spent NUMERIC, orders_count INTEGER, last_order_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH c AS (
    SELECT id, customers.email
      FROM customers
     WHERE org_id = p_org
       AND customers.email IN (SELECT normalize_email(e) FROM unnest(p_emails) e)
  ),
  o AS (
    SELECT c.email, o.site_id, o.created_at, o.total, o.currency,
           CASE WHEN o.status = 'refunded' AND o.refunded_total <= 0 THEN o.total
                ELSE least(o.refunded_total, o.total) END AS refunded,
           o.status
      FROM orders o
      JOIN c ON o.customer_id = c.id
      JOIN sites s ON s.id = o.site_id AND s.org_id = p_org
     WHERE o.org_id = p_org
       AND o.site_id = ANY (p_site_ids)
       AND o.status IN ('completed', 'processing', 'refunded')
  ),
  k AS (
    SELECT o.*,
           NOT ((o.refunded > 0 AND o.refunded >= o.total) OR (o.status = 'refunded' AND o.refunded <= 0)) AS kept
      FROM o
  )
  SELECT k.email, k.site_id,
         round(sum((k.total - k.refunded) * fx_rate(k.currency)), 2) AS total_spent,
         (count(*) FILTER (WHERE k.kept))::INTEGER AS orders_count,
         max(k.created_at) FILTER (WHERE k.kept) AS last_order_at
    FROM k
   GROUP BY k.email, k.site_id
  HAVING count(*) FILTER (WHERE k.kept) > 0
   ORDER BY k.email, k.site_id
$$;

REVOKE ALL ON FUNCTION public.support_customers_summary(UUID, TEXT[], UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_customers_summary(UUID, TEXT[], UUID[]) TO service_role;
