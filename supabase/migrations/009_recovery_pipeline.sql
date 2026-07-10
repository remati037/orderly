-- =============================================================
-- Orderly — Payment recovery pipeline (Faza 2)
--
-- Orders that never got paid (on-hold, failed, pending, checkout-draft) become
-- tasks an agent works through. Task creation and closing live in a trigger,
-- not in application code, so they fire identically for the Woo webhook, the
-- Thinkific webhook, the cron sync and a manual status change in the DB.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- ── 1. Customer phone ────────────────────────────────────────────────────────
-- WooCommerce already sends billing.phone; it was being dropped into woo_data
-- and never surfaced. Promote it to a column and backfill history.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;

UPDATE public.orders
SET customer_phone = NULLIF(woo_data -> 'billing' ->> 'phone', '')
WHERE customer_phone IS NULL
  AND woo_data -> 'billing' ->> 'phone' IS NOT NULL;

-- ── 2. Tasks ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recovery_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  stage             TEXT NOT NULL DEFAULT 'novo'
                      CHECK (stage IN ('novo','kontaktiran','ceka_uplatu','naplaceno','otkazano')),
  assigned_to       UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  attempts          INTEGER NOT NULL DEFAULT 0,
  last_contacted_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Activity log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recovery_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.recovery_tasks(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  channel    TEXT NOT NULL DEFAULT 'napomena'
               CHECK (channel IN ('telefon','email','napomena')),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Keep tasks in sync with order status ──────────────────────────────────
-- SECURITY DEFINER so it runs regardless of which role wrote the order row.
CREATE OR REPLACE FUNCTION public.sync_recovery_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('on-hold','failed','pending','checkout-draft') THEN
    -- Open a task. If one already exists (including a closed one) leave it be:
    -- reopening a settled task would silently resurrect finished work.
    INSERT INTO recovery_tasks (order_id) VALUES (NEW.id)
    ON CONFLICT (order_id) DO NOTHING;

  ELSIF NEW.status IN ('completed','processing') THEN
    -- The customer paid. Close the task no matter which stage it sat in.
    UPDATE recovery_tasks
       SET stage = 'naplaceno', updated_at = NOW()
     WHERE order_id = NEW.id
       AND stage NOT IN ('naplaceno','otkazano');

  ELSIF NEW.status IN ('cancelled','refunded') THEN
    UPDATE recovery_tasks
       SET stage = 'otkazano', updated_at = NOW()
     WHERE order_id = NEW.id
       AND stage NOT IN ('naplaceno','otkazano');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_recovery_task ON public.orders;
CREATE TRIGGER trg_sync_recovery_task
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_recovery_task();

-- ── 5. Backfill tasks for orders that are already stuck ──────────────────────
INSERT INTO recovery_tasks (order_id)
SELECT id FROM public.orders
WHERE status IN ('on-hold','failed','pending','checkout-draft')
ON CONFLICT (order_id) DO NOTHING;

-- ── 6. RLS — server-only. Agents reach these through API routes. ─────────────
ALTER TABLE recovery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON recovery_tasks FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON recovery_notes FOR ALL TO service_role USING (true);

REVOKE ALL ON public.recovery_tasks FROM anon, authenticated;
REVOKE ALL ON public.recovery_notes FROM anon, authenticated;

-- customer_phone must never reach the browser directly.
REVOKE SELECT (customer_phone) ON public.orders FROM anon, authenticated;

-- ── 7. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recovery_tasks_stage    ON recovery_tasks(stage);
CREATE INDEX IF NOT EXISTS idx_recovery_tasks_assigned ON recovery_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_recovery_notes_task     ON recovery_notes(task_id);
