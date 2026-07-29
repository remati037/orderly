-- =============================================================
-- Orderly — "call list" for recently-successful (processing) orders
--
-- Separate on purpose from recovery_tasks: those are for orders that never
-- got paid (on-hold/failed/pending/checkout-draft — see 009_recovery_pipeline.sql).
-- `processing` is a COUNTED, successful status, so it must never enter that
-- pipeline (the recovery trigger would immediately try to close it as
-- "naplaceno"). This is just a lightweight "who has Nevena called" checklist
-- for the last few days of processing orders — no stages, no notes, no trigger.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

CREATE TABLE IF NOT EXISTS processing_calls (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  called_by  UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  called_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS — server-only, same pattern as recovery_tasks/recovery_notes. Agents
-- reach this through the API route, never directly.
ALTER TABLE processing_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON processing_calls FOR ALL TO service_role USING (true);
REVOKE ALL ON public.processing_calls FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_processing_calls_order ON processing_calls(order_id);
