-- Reverses 020_sms_recovery.sql. Drops the SMS queue with its history.
DROP TRIGGER IF EXISTS trg_sms_enqueue_recovery ON public.recovery_tasks;
DROP TRIGGER IF EXISTS trg_sms_cancel_on_close  ON public.recovery_tasks;
DROP TRIGGER IF EXISTS trg_sms_handle_inbound   ON public.sms_inbox;

DROP FUNCTION IF EXISTS public.sms_claim(INT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.sms_enqueue_recovery();
DROP FUNCTION IF EXISTS public.sms_cancel_on_close();
DROP FUNCTION IF EXISTS public.sms_handle_inbound();

DROP TABLE IF EXISTS public.sms_inbox;
DROP TABLE IF EXISTS public.sms_outbox;
DROP TABLE IF EXISTS public.sms_optouts;

DROP FUNCTION IF EXISTS public.sms_ascii(TEXT);
DROP FUNCTION IF EXISTS public.sms_phone_key(TEXT);

DELETE FROM recovery_notes WHERE channel = 'sms';
ALTER TABLE recovery_notes DROP CONSTRAINT IF EXISTS recovery_notes_channel_check;
ALTER TABLE recovery_notes
  ADD CONSTRAINT recovery_notes_channel_check
  CHECK (channel IN ('telefon','email','napomena'));

DELETE FROM settings WHERE key IN ('sms_recovery', 'sms_gateway_token_sha256');
