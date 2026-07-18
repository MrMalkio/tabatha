-- ============================================================
-- Tabatha Migration 037 — Sidecar schedule-nudge delivery cron
-- Project: mtdgoahskcibjbhfvofx
--
-- Schedules the `send-schedule-nudges` edge function every 5 minutes
-- (design doc §4.3 — a separate, lower-frequency cron from
-- `sidecar-focus-push`'s 1-minute tick, for blast-radius isolation and
-- because the clock-in check's 15-minute grace / 120-minute cutoff
-- window tolerates a coarser tick). v1 scope: clock-in check only.
--
-- Mirrors migration 031's shape exactly: the service role bearer is read
-- at run time from Vault (same secret, `sidecar_cron_key` — no new
-- secret needed, both functions authenticate as the same cron caller).
-- Insert that secret out-of-band if it isn't already present:
--   select vault.create_secret('<service_role_key>', 'sidecar_cron_key');
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any prior schedule of the same name (no-op if absent).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'sidecar-schedule-nudges';

SELECT cron.schedule(
  'sidecar-schedule-nudges',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://mtdgoahskcibjbhfvofx.supabase.co/functions/v1/send-schedule-nudges',
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
