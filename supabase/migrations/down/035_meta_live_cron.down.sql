-- Reverses 032_meta_live_cron.sql. The extensions stay installed, they are harmless.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $sql$SELECT cron.unschedule('meta-live')$sql$;
  END IF;
END
$do$;
