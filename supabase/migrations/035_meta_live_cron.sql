-- =============================================================
-- Orderly — 15-minute trigger for /api/cron/meta-live
--
-- Vercel Hobby crons run once a day, so pg_cron + pg_net call the route. The
-- bearer token lives in Supabase Vault (name 'meta_live_token'), its SHA-256 in
-- settings.meta_live_token_sha256. Apply only after the route is deployed.
-- Skipped where pg_cron doesn't exist, like the PGlite test database.
-- =============================================================

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;

  EXECUTE $sql$
    SELECT cron.schedule(
      'meta-live',
      '*/15 * * * *',
      $job$
      SELECT net.http_get(
        url := 'https://orderly-drab.vercel.app/api/cron/meta-live',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'meta_live_token')
        ),
        timeout_milliseconds := 300000
      );
      $job$
    )
  $sql$;
END
$do$;
