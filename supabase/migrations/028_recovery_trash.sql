-- =============================================================
-- Orderly — an order trashed in WooCommerce closes its recovery card
--
-- Orders deleted in Woo (test orders, duplicates) now arrive as status
-- 'trash' (order.deleted webhook + daily cron). Treat it like 'cancelled'.
-- Only the function body changes; the trigger stays as it is.
-- =============================================================

SET lock_timeout = '5s';

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

  ELSIF NEW.status IN ('cancelled','refunded','trash') THEN
    UPDATE recovery_tasks
       SET stage = 'otkazano', updated_at = NOW()
     WHERE order_id = NEW.id
       AND stage NOT IN ('naplaceno','otkazano');
  END IF;

  RETURN NEW;
END;
$$;

