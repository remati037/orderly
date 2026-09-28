-- =============================================================
-- Orderly — one-time repair of data inflated by non-idempotent syncs
--
-- 1. customers.order_count / total_spent used to be incremented on every
--    webhook redelivery and every re-sync of the same order. The app now
--    recomputes them from orders; this brings existing rows in line.
--    Counted statuses match lib/utils/order-status.ts (completed, processing).
--
-- 2. Thinkific subscriptions were inserted again on every sync/webhook.
--    Keep the earliest row per (site, customer, product), carry over the
--    latest mrr, and delete the duplicates.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

BEGIN;

-- ── 1. Customer totals ───────────────────────────────────────────────────────
WITH agg AS (
  SELECT
    c.id,
    COUNT(o.id)                         AS order_count,
    COALESCE(SUM(o.total), 0)           AS total_spent,
    MIN(o.created_at)                   AS first_order_at,
    MAX(o.created_at)                   AS last_order_at
  FROM public.customers c
  LEFT JOIN public.orders o
    ON o.customer_email = c.email
   AND o.status IN ('completed', 'processing')
  -- Only customers that still have orders in the table. ~4.7k customers point
  -- at orders that no longer exist (deleted site / force resync); their totals
  -- can't be recomputed, so they keep their old values.
  WHERE EXISTS (SELECT 1 FROM public.orders a WHERE a.customer_email = c.email)
  GROUP BY c.id
)
UPDATE public.customers c
SET order_count    = agg.order_count,
    total_spent    = agg.total_spent,
    first_order_at = COALESCE(agg.first_order_at, c.first_order_at),
    last_order_at  = COALESCE(agg.last_order_at,  c.last_order_at)
FROM agg
WHERE agg.id = c.id;

-- ── 2. Thinkific subscription duplicates ─────────────────────────────────────
WITH ranked AS (
  SELECT
    s.id,
    ROW_NUMBER() OVER w_first AS rn_first,
    FIRST_VALUE(s.mrr) OVER w_last  AS latest_mrr
  FROM public.subscriptions s
  JOIN public.sites st ON st.id = s.site_id AND st.platform = 'thinkific'
  WHERE s.stripe_subscription_id IS NULL
  WINDOW
    w_first AS (PARTITION BY s.site_id, s.customer_id, s.product_name
                ORDER BY s.started_at ASC, s.created_at ASC),
    w_last  AS (PARTITION BY s.site_id, s.customer_id, s.product_name
                ORDER BY s.started_at DESC, s.created_at DESC)
),
upd AS (
  UPDATE public.subscriptions s
  SET mrr = r.latest_mrr
  FROM ranked r
  WHERE r.id = s.id AND r.rn_first = 1
  RETURNING s.id
)
DELETE FROM public.subscriptions s
USING ranked r
WHERE r.id = s.id AND r.rn_first > 1;

COMMIT;
