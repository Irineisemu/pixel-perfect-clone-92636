CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento antigo (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('sync-all-processes');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sync-all-processes',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://csmpefmtdmdmaopnukmx.supabase.co/functions/v1/sync-all-processes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbXBlZm10ZG1kbWFvcG51a214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTA2NTUsImV4cCI6MjA5Mzg4NjY1NX0.WHndcCWyyrEZ2vBxYAJq1iM7CvmhgOT9MMjRMaBbW98'
    ),
    body := '{}'::jsonb
  );
  $$
);