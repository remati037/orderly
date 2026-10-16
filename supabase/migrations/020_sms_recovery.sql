-- =============================================================
-- Orderly — SMS payment recovery
--
-- When a recovery task opens for a WooCommerce order, three SMS reminders are
-- queued (now, +24h, +72h) as `pending_approval`. Nothing is ever sent until a
-- team member approves it in the board. The Mac-hosted SMS gateway only pulls
-- `approved` rows whose due_at has passed.
--
-- Cancelling is done in the database, like the tasks themselves: when a task
-- closes (paid / cancelled) every unsent reminder is cancelled, whichever path
-- changed the order. A customer replying STOP is opted out the same way.
--
-- Ships DISABLED: settings.sms_recovery.enabled = false. Applying this
-- migration changes nothing until the owner turns it on in the board.
-- =============================================================

-- ── 1. Tables ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_outbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES recovery_tasks(id) ON DELETE CASCADE,
  step          SMALLINT NOT NULL CHECK (step BETWEEN 1 AND 3),
  to_number     TEXT NOT NULL,
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 480),
  status        TEXT NOT NULL DEFAULT 'pending_approval'
                  CHECK (status IN ('pending_approval','approved','sending','sent','failed','cancelled')),
  due_at        TIMESTAMPTZ NOT NULL,
  approved_by   UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  error         TEXT,
  cancel_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, step)
);

CREATE TABLE IF NOT EXISTS sms_inbox (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,                 -- gateway's own id, makes retries idempotent
  from_number TEXT NOT NULL,
  body        TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  task_id     UUID REFERENCES recovery_tasks(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keyed on the last 9 digits so 0656384599 and +381656384599 are the same person.
CREATE TABLE IF NOT EXISTS sms_optouts (
  phone_key  TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_outbox_claim  ON sms_outbox(due_at) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_sms_outbox_status ON sms_outbox(status);
CREATE INDEX IF NOT EXISTS idx_sms_inbox_task    ON sms_inbox(task_id);

-- The activity log gets an 'sms' channel.
ALTER TABLE recovery_notes DROP CONSTRAINT IF EXISTS recovery_notes_channel_check;
ALTER TABLE recovery_notes
  ADD CONSTRAINT recovery_notes_channel_check
  CHECK (channel IN ('telefon','email','napomena','sms'));

-- ── 2. Helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sms_phone_key(phone TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)
$$;

-- Plain ASCII keeps a message in the GSM-7 alphabet (160 chars/segment instead
-- of 70), and some phones mangle č/ć/š/ž/đ anyway.
CREATE OR REPLACE FUNCTION public.sms_ascii(t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(t, 'čćšžđČĆŠŽĐ', 'ccszdCCSZD')
$$;

-- ── 3. Settings (ships disabled) ─────────────────────────────────────────────
-- Placeholders: {ime} {broj} {iznos} {link} {sajt}
INSERT INTO settings (key, value) VALUES (
  'sms_recovery',
  jsonb_build_object(
    'enabled',       false,
    'enabled_from',  NULL,
    'statuses',      jsonb_build_array('failed', 'pending'),
    'delays_hours',  jsonb_build_array(0, 24, 72),
    'templates',     jsonb_build_object(
      '1', '{sajt}: Placanje za porudzbinu #{broj} ({iznos}) nije prosla. Zavrsite je ovde: {link}',
      '2', '{sajt}: Podsecamo Vas da porudzbina #{broj} ceka uplatu. Zavrsite placanje: {link}',
      '3', '{sajt}: Poslednji podsetnik - porudzbina #{broj} uskoro istice. Placanje: {link} Odgovorite STOP za odjavu.'
    )
  )
) ON CONFLICT (key) DO NOTHING;

-- ── 4. Queue reminders when a recovery task opens ────────────────────────────
CREATE OR REPLACE FUNCTION public.sms_enqueue_recovery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg     JSONB;
  o       RECORD;
  phone   TEXT;
  link    TEXT;
  delays  JSONB;
  tpl     TEXT;
  txt     TEXT;
  i       INT;
BEGIN
  SELECT value INTO cfg FROM settings WHERE key = 'sms_recovery';
  IF cfg IS NULL OR coalesce((cfg ->> 'enabled')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  -- Only tasks that open after the owner switched it on. Without this, turning
  -- the feature on would message every customer already sitting in the backlog.
  IF cfg ->> 'enabled_from' IS NULL
     OR NEW.created_at < (cfg ->> 'enabled_from')::TIMESTAMPTZ THEN
    RETURN NEW;
  END IF;

  SELECT ord.id, ord.status, ord.source, ord.customer_name, ord.customer_phone,
         ord.woo_order_id, ord.total, ord.currency, ord.woo_data, s.name AS site_name
    INTO o
    FROM orders ord JOIN sites s ON s.id = ord.site_id
   WHERE ord.id = NEW.order_id;

  IF NOT FOUND OR o.source <> 'woocommerce' THEN RETURN NEW; END IF;
  IF NOT (cfg -> 'statuses') ? o.status THEN RETURN NEW; END IF;

  phone := nullif(trim(coalesce(o.customer_phone, '')), '');
  link  := nullif(o.woo_data ->> 'payment_url', '');
  IF phone IS NULL OR link IS NULL OR length(sms_phone_key(phone)) < 8 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM sms_optouts WHERE phone_key = sms_phone_key(phone)) THEN
    RETURN NEW;
  END IF;

  -- One customer with several failed orders gets one sequence, not three.
  IF EXISTS (
    SELECT 1 FROM sms_outbox
     WHERE sms_phone_key(to_number) = sms_phone_key(phone)
       AND status IN ('pending_approval','approved','sending','sent')
       AND created_at > NOW() - INTERVAL '3 days'
  ) THEN
    RETURN NEW;
  END IF;

  delays := coalesce(cfg -> 'delays_hours', '[0,24,72]'::JSONB);

  FOR i IN 1..3 LOOP
    tpl := cfg -> 'templates' ->> i::TEXT;
    CONTINUE WHEN tpl IS NULL OR btrim(tpl) = '';

    txt := tpl;
    txt := replace(txt, '{ime}',   coalesce(nullif(split_part(btrim(coalesce(o.customer_name, '')), ' ', 1), ''), ''));
    txt := replace(txt, '{broj}',  coalesce(o.woo_order_id, ''));
    txt := replace(txt, '{iznos}', CASE WHEN o.total = round(o.total) THEN round(o.total)::TEXT ELSE to_char(o.total, 'FM999999990.00') END
                   || ' ' || coalesce(o.currency, 'RSD'));
    txt := replace(txt, '{sajt}',  coalesce(o.site_name, ''));
    txt := replace(txt, '{link}',  link);

    INSERT INTO sms_outbox (task_id, step, to_number, body, due_at)
    VALUES (
      NEW.id, i, phone, left(sms_ascii(txt), 480),
      NEW.created_at + make_interval(hours => coalesce((delays ->> (i - 1))::INT, 0))
    )
    ON CONFLICT (task_id, step) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_enqueue_recovery ON public.recovery_tasks;
CREATE TRIGGER trg_sms_enqueue_recovery
AFTER INSERT ON public.recovery_tasks
FOR EACH ROW EXECUTE FUNCTION public.sms_enqueue_recovery();

-- ── 5. Cancel unsent reminders the moment a task closes ──────────────────────
CREATE OR REPLACE FUNCTION public.sms_cancel_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE sms_outbox
     SET status = 'cancelled',
         cancel_reason = CASE NEW.stage WHEN 'naplaceno' THEN 'customer paid' ELSE 'order cancelled' END,
         updated_at = NOW()
   WHERE task_id = NEW.id
     AND status IN ('pending_approval','approved');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_cancel_on_close ON public.recovery_tasks;
CREATE TRIGGER trg_sms_cancel_on_close
AFTER UPDATE OF stage ON public.recovery_tasks
FOR EACH ROW
WHEN (NEW.stage IN ('naplaceno','otkazano') AND OLD.stage IS DISTINCT FROM NEW.stage)
EXECUTE FUNCTION public.sms_cancel_on_close();

-- ── 6. Inbound: match to a task, log it, honour STOP ─────────────────────────
CREATE OR REPLACE FUNCTION public.sms_handle_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k TEXT := sms_phone_key(NEW.from_number);
  tid UUID;
BEGIN
  IF length(k) < 8 THEN RETURN NEW; END IF;   -- alphanumeric senders ("A1 SRB", "1236")

  IF lower(btrim(NEW.body)) IN ('stop','odjava','otkazi','otkaži','unsubscribe') THEN
    INSERT INTO sms_optouts (phone_key) VALUES (k) ON CONFLICT DO NOTHING;
    UPDATE sms_outbox
       SET status = 'cancelled', cancel_reason = 'recipient replied STOP', updated_at = NOW()
     WHERE sms_phone_key(to_number) = k AND status IN ('pending_approval','approved');
  END IF;

  SELECT t.id INTO tid
    FROM recovery_tasks t JOIN orders o ON o.id = t.order_id
   WHERE sms_phone_key(o.customer_phone) = k
   ORDER BY t.created_at DESC
   LIMIT 1;

  IF tid IS NOT NULL THEN
    NEW.task_id := tid;
    INSERT INTO recovery_notes (task_id, channel, body)
    VALUES (tid, 'sms', 'Odgovor kupca: ' || NEW.body);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_handle_inbound ON public.sms_inbox;
CREATE TRIGGER trg_sms_handle_inbound
BEFORE INSERT ON public.sms_inbox
FOR EACH ROW EXECUTE FUNCTION public.sms_handle_inbound();

-- ── 7. Gateway claim ─────────────────────────────────────────────────────────
-- Atomic: a row is handed to exactly one caller. Sends only 08:00–21:00 Belgrade
-- time, and first drops reminders for customers who paid another order since.
-- now_at exists for tests; the gateway route never passes it.
CREATE OR REPLACE FUNCTION public.sms_claim(max_rows INT DEFAULT 10, now_at TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (msg_id UUID, msg_to TEXT, msg_body TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h INT := extract(hour FROM (now_at AT TIME ZONE 'Europe/Belgrade'))::INT;
BEGIN
  -- A claim whose result never came back (gateway lost the response or died)
  -- would sit in 'sending' forever. Fail it rather than retry: it may have gone out.
  UPDATE sms_outbox
     SET status = 'failed', error = 'gateway never reported a result', updated_at = now_at
   WHERE status = 'sending' AND updated_at < now_at - INTERVAL '24 hours';

  IF h < 8 OR h >= 21 THEN RETURN; END IF;

  UPDATE sms_outbox m
     SET status = 'cancelled', cancel_reason = 'customer paid another order', updated_at = now_at
    FROM recovery_tasks t
    JOIN orders o ON o.id = t.order_id
   WHERE m.task_id = t.id
     AND m.status IN ('pending_approval','approved')
     AND o.customer_email IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM orders p
        WHERE lower(p.customer_email) = lower(o.customer_email)
          AND p.status IN ('processing','completed')
          AND p.created_at >= t.created_at - INTERVAL '1 day'
     );

  RETURN QUERY
  WITH picked AS (
    SELECT x.id FROM sms_outbox x
     WHERE x.status = 'approved' AND x.due_at <= now_at
     ORDER BY x.due_at
     LIMIT max_rows
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE sms_outbox m
       SET status = 'sending', updated_at = now_at
      FROM picked WHERE m.id = picked.id
    RETURNING m.id, m.to_number, m.body
  )
  SELECT upd.id, upd.to_number, upd.body FROM upd;
END;
$$;

-- ── 8. Access: server-only, like the rest of the recovery pipeline ───────────
ALTER TABLE sms_outbox  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_inbox   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_optouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON sms_outbox;
CREATE POLICY "service_role_all" ON sms_outbox  FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "service_role_all" ON sms_inbox;
CREATE POLICY "service_role_all" ON sms_inbox   FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "service_role_all" ON sms_optouts;
CREATE POLICY "service_role_all" ON sms_optouts FOR ALL TO service_role USING (true);

REVOKE ALL ON public.sms_outbox, public.sms_inbox, public.sms_optouts FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.sms_claim(INT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_enqueue_recovery() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_cancel_on_close()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_handle_inbound()   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_claim(INT, TIMESTAMPTZ) TO service_role;
