-- ============================================================
-- Tabatha Migration 031 — Sidecar push delivery cron
-- Project: mtdgoahskcibjbhfvofx
--
-- Schedules the `send-focus-push` edge function once a minute. The function
-- scans for expired Sidecar focus timers and delivers Web Push. The service
-- role bearer is read at run time from Vault (secret name `sidecar_cron_key`)
-- so no key is stored in this file or in git. Insert that secret out-of-band:
--   select vault.create_secret('<service_role_key>', 'sidecar_cron_key');
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any prior schedule of the same name (no-op if absent).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'sidecar-focus-push';

SELECT cron.schedule(
  'sidecar-focus-push',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://mtdgoahskcibjbhfvofx.supabase.co/functions/v1/send-focus-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'sidecar_cron_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
