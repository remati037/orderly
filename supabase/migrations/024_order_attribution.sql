-- =============================================================
-- Orderly — order attribution (where the customer came from)
--
-- WooCommerce's built-in order attribution stores source / UTM / referrer /
-- device in meta_data (_wc_order_attribution_*). We already keep the whole
-- payload in woo_data; this lifts those fields into columns so reports and
-- segments can filter on them. A trigger fills them on every write of
-- woo_data, so webhook, cron and manual sync all go through the same code.
--
-- Backfill: one UPDATE over the Woo orders that carry attribution meta.
-- =============================================================

SET lock_timeout = '5s';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_type   TEXT,   -- utm | organic | referral | typein | admin | …
  ADD COLUMN IF NOT EXISTS utm_source    TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium    TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign  TEXT,
  ADD COLUMN IF NOT EXISTS utm_content   TEXT,
  ADD COLUMN IF NOT EXISTS utm_term      TEXT,
  ADD COLUMN IF NOT EXISTS referrer      TEXT,
  ADD COLUMN IF NOT EXISTS landing_page  TEXT,
  ADD COLUMN IF NOT EXISTS device_type   TEXT,   -- Mobile | Desktop | Tablet
  ADD COLUMN IF NOT EXISTS session_pages INTEGER,
  ADD COLUMN IF NOT EXISTS session_count INTEGER;

-- One _wc_order_attribution_* value, '' treated as missing.
CREATE OR REPLACE FUNCTION public.woo_attribution(woo_data JSONB, field TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(m ->> 'value'), '')
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(woo_data -> 'meta_data') = 'array'
                THEN woo_data -> 'meta_data' ELSE '[]'::jsonb END) m
   WHERE m ->> 'key' = '_wc_order_attribution_' || field
   LIMIT 1
$$;

-- UTM values arrive form-encoded ("Akcija+menja+zivot"). Decode the '+' only;
-- a full percent-decode isn't worth the risk of mangling odd values.
CREATE OR REPLACE FUNCTION public.woo_utm(woo_data JSONB, field TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(replace(public.woo_attribution(woo_data, field), '+', ' ')), '')
$$;

CREATE OR REPLACE FUNCTION public.woo_int(v TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v ~ '^\d{1,9}$' THEN v::INTEGER END
$$;

CREATE OR REPLACE FUNCTION public.orders_set_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source = 'woocommerce' AND NEW.woo_data IS NOT NULL THEN
    NEW.source_type   := woo_attribution(NEW.woo_data, 'source_type');
    NEW.utm_source    := woo_utm(NEW.woo_data, 'utm_source');
    NEW.utm_medium    := woo_utm(NEW.woo_data, 'utm_medium');
    NEW.utm_campaign  := woo_utm(NEW.woo_data, 'utm_campaign');
    NEW.utm_content   := woo_utm(NEW.woo_data, 'utm_content');
    NEW.utm_term      := woo_utm(NEW.woo_data, 'utm_term');
    NEW.referrer      := woo_attribution(NEW.woo_data, 'referrer');
    NEW.landing_page  := woo_attribution(NEW.woo_data, 'session_entry');
    NEW.device_type   := woo_attribution(NEW.woo_data, 'device_type');
    NEW.session_pages := woo_int(woo_attribution(NEW.woo_data, 'session_pages'));
    NEW.session_count := woo_int(woo_attribution(NEW.woo_data, 'session_count'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_set_attribution ON public.orders;
CREATE TRIGGER trg_orders_set_attribution
BEFORE INSERT OR UPDATE OF woo_data ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_set_attribution();

-- Backfill. Only rows that actually carry attribution meta are touched.
UPDATE public.orders o
   SET source_type   = woo_attribution(o.woo_data, 'source_type'),
       utm_source    = woo_utm(o.woo_data, 'utm_source'),
       utm_medium    = woo_utm(o.woo_data, 'utm_medium'),
       utm_campaign  = woo_utm(o.woo_data, 'utm_campaign'),
       utm_content   = woo_utm(o.woo_data, 'utm_content'),
       utm_term      = woo_utm(o.woo_data, 'utm_term'),
       referrer      = woo_attribution(o.woo_data, 'referrer'),
       landing_page  = woo_attribution(o.woo_data, 'session_entry'),
       device_type   = woo_attribution(o.woo_data, 'device_type'),
       session_pages = woo_int(woo_attribution(o.woo_data, 'session_pages')),
       session_count = woo_int(woo_attribution(o.woo_data, 'session_count'))
 WHERE o.source = 'woocommerce'
   AND woo_attribution(o.woo_data, 'source_type') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_utm_source  ON public.orders (utm_source)  WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_source_type ON public.orders (source_type) WHERE source_type IS NOT NULL;
