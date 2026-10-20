-- =============================================================
-- Orderly — Circle access grants
--
-- When a paid WooCommerce order contains a product that has a rule in
-- settings.circle_access, Orderly creates the buyer in Circle (if needed) and
-- adds them to the rule's access group. One row per (order, access group) makes
-- the grant idempotent (webhook redeliveries) and retryable (cron sweep).
--
-- Ships DISABLED: settings.circle_access = {"enabled": false, "rules": []}.
-- rules: [{ "site_id": "<uuid>", "woo_product_id": 123, "access_group_id": 132017 }]
-- The Circle Admin token is sites.circle_token (server-only), not stored here.
-- =============================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.circle_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                    REFERENCES public.organizations(id),
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  access_group_id BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('ok','error')),
  attempts        INTEGER NOT NULL DEFAULT 1,
  last_error      TEXT,
  granted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, access_group_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_grants_status ON public.circle_grants (status, updated_at);

ALTER TABLE public.circle_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON public.circle_grants;
CREATE POLICY "service_role_all" ON public.circle_grants FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "org_read" ON public.circle_grants;
CREATE POLICY "org_read" ON public.circle_grants FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
REVOKE ALL ON public.circle_grants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.circle_grants FROM authenticated;

INSERT INTO settings (key, value) VALUES (
  'circle_access',
  jsonb_build_object('enabled', false, 'rules', jsonb_build_array())
) ON CONFLICT (key) DO NOTHING;
