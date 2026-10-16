-- Reverses 024_order_attribution.sql. woo_data is untouched, so re-applying restores everything.
SET lock_timeout = '5s';
DROP TRIGGER IF EXISTS trg_orders_set_attribution ON public.orders;
DROP FUNCTION IF EXISTS public.orders_set_attribution();
DROP FUNCTION IF EXISTS public.woo_utm(JSONB, TEXT);
DROP FUNCTION IF EXISTS public.woo_int(TEXT);
DROP FUNCTION IF EXISTS public.woo_attribution(JSONB, TEXT);
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS utm_source,
  DROP COLUMN IF EXISTS utm_medium,
  DROP COLUMN IF EXISTS utm_campaign,
  DROP COLUMN IF EXISTS utm_content,
  DROP COLUMN IF EXISTS utm_term,
  DROP COLUMN IF EXISTS referrer,
  DROP COLUMN IF EXISTS landing_page,
  DROP COLUMN IF EXISTS device_type,
  DROP COLUMN IF EXISTS session_pages,
  DROP COLUMN IF EXISTS session_count;
