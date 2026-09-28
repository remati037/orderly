-- =============================================================
-- Orderly — customers.total_spent in the base currency
--
-- Orders come in EUR / RSD / USD; total_spent used to be a raw sum across
-- currencies, and /api/customers then treated the whole sum as RSD (×0.00855),
-- so a €500 customer showed as ~€4. From now on upsertCustomer stores it
-- converted to the base currency; this recomputes existing rows the same way
-- (rates from settings, falling back to lib/utils/fx DEFAULT_RATES).
--
-- Only customers that still have orders are recomputed (see 015); the ~4.7k
-- whose orders no longer exist keep their stored value.
-- =============================================================

WITH cfg AS (
  SELECT
    COALESCE((SELECT value FROM public.settings WHERE key = 'exchange_rates'),
             '{"EUR": 1, "RSD": 0.00855, "USD": 0.92}'::jsonb) AS rates,
    COALESCE((SELECT value #>> '{}' FROM public.settings WHERE key = 'base_currency'), 'EUR') AS base
),
agg AS (
  SELECT
    c.id,
    ROUND(COALESCE(SUM(
      o.total * CASE
        WHEN COALESCE(o.currency, 'RSD') = cfg.base THEN 1
        ELSE COALESCE((cfg.rates ->> COALESCE(o.currency, 'RSD'))::numeric, 1)
      END
    ), 0), 2) AS total_spent
  FROM public.customers c
  CROSS JOIN cfg
  LEFT JOIN public.orders o
    ON o.customer_email = c.email
   AND o.status IN ('completed', 'processing')
  WHERE EXISTS (SELECT 1 FROM public.orders a WHERE a.customer_email = c.email)
  GROUP BY c.id
)
UPDATE public.customers c
SET total_spent = agg.total_spent
FROM agg
WHERE agg.id = c.id;
