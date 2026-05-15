
CREATE TABLE IF NOT EXISTS public.worker_heartbeats (
  worker_id text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "heartbeats_read_authenticated"
  ON public.worker_heartbeats
  FOR SELECT
  TO authenticated
  USING (true);
