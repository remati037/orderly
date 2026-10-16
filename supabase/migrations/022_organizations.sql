-- =============================================================
-- Orderly — organizations (SaaS-ready from day one)
--
-- One organization exists today. Every public table gets org_id, defaulting to
-- it, so existing code keeps inserting without knowing about orgs. Browser
-- reads (RLS for `authenticated`) are scoped to the signed-in member's org;
-- the server uses the service role and is unaffected.
--
-- Safe on a live database: ADD COLUMN with a constant default doesn't rewrite
-- the table, the foreign key is added NOT VALID and validated without blocking
-- writes, and lock_timeout makes the migration give up instead of queueing
-- behind a webhook (and every webhook behind it).
--
-- Known debt for Faza 5: settings.key and customers.email are still unique
-- globally (code upserts on them), not per org.
-- =============================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Europe/Belgrade',
  base_currency TEXT NOT NULL DEFAULT 'EUR',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Vladsdigital')
ON CONFLICT (id) DO NOTHING;

-- Every base table in public, including ones added by later branches.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> 'organizations'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL
         DEFAULT ''00000000-0000-0000-0000-000000000001''', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_org_id_fkey') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (org_id)
           REFERENCES public.organizations(id) NOT VALID', t, t || '_org_id_fkey');
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', t, t || '_org_id_fkey');
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_org_created ON public.orders (org_id, created_at DESC);

-- The org of whoever is signed in. NULL for anyone who isn't a team member,
-- which makes every org-scoped policy return nothing for them.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.team_members
   WHERE auth_user_id = auth.uid() AND is_active
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;

-- Browser read access, scoped to the member's org. Includes the two policies
-- that were created by hand in the dashboard ("Enable read for authenticated users").
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sites','customers','orders','order_items','products',
                           'subscriptions','settings','sync_log','sound_settings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_read_all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "org_read" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "org_read" ON public.%I FOR SELECT TO authenticated
         USING (org_id = public.current_org_id())', t);
  END LOOP;
END $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON public.organizations;
CREATE POLICY "service_role_all" ON public.organizations FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "org_read" ON public.organizations;
CREATE POLICY "org_read" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id());
REVOKE ALL ON public.organizations FROM anon;
