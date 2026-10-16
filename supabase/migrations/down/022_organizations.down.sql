-- Reverses 022_organizations.sql: open read policies again, drop org_id everywhere.
SET lock_timeout = '5s';

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sites','customers','orders','order_items','products',
                           'subscriptions','settings','sync_log','sound_settings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "org_read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "authenticated_read_all" ON public.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.idx_orders_org_created;
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'org_id' AND table_name <> 'organizations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN org_id', t);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.organizations;
DROP FUNCTION IF EXISTS public.current_org_id();
