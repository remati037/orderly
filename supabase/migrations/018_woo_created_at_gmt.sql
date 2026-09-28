-- =============================================================
-- Orderly — WooCommerce order timestamps from the *_gmt fields
--
-- normalizeWooOrder parsed date_created (shop-local time, no offset) as UTC.
-- For shops set to Europe/Belgrade every order landed 1–2h late, shifting
-- orders near midnight into the wrong day. Rewrite created_at / updated_at
-- from the UTC values stored in woo_data.
-- =============================================================

UPDATE public.orders
SET created_at = ((woo_data ->> 'date_created_gmt')::timestamp AT TIME ZONE 'UTC'),
    updated_at = COALESCE(((woo_data ->> 'date_modified_gmt')::timestamp AT TIME ZONE 'UTC'), updated_at)
WHERE source = 'woocommerce'
  AND woo_data ->> 'date_created_gmt' IS NOT NULL
  AND created_at IS DISTINCT FROM ((woo_data ->> 'date_created_gmt')::timestamp AT TIME ZONE 'UTC');
