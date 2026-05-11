ALTER TYPE public.target_type ADD VALUE IF NOT EXISTS 'lawyer';

ALTER TABLE public.monitoring_targets
  ADD COLUMN IF NOT EXISTS oab_numbers TEXT[],
  ADD COLUMN IF NOT EXISTS lawyer_name TEXT,
  ADD COLUMN IF NOT EXISTS include_inactive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tribunal_scope TEXT[] NOT NULL DEFAULT ARRAY['api_publica_tjrj']::text[],
  ADD COLUMN IF NOT EXISTS auto_discovered BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_discovery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discovery_status TEXT;

DO $$ BEGIN
  ALTER TABLE public.monitoring_targets
    ADD CONSTRAINT discovery_status_chk
    CHECK (discovery_status IS NULL OR discovery_status IN ('pending','running','completed','failed','partial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Constraint: se oab_numbers for setado, exige nome e tamanho 1..10
DO $$ BEGIN
  ALTER TABLE public.monitoring_targets
    ADD CONSTRAINT valid_lawyer CHECK (
      oab_numbers IS NULL OR (
        array_length(oab_numbers, 1) BETWEEN 1 AND 10
        AND lawyer_name IS NOT NULL
        AND length(btrim(lawyer_name)) >= 3
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índice GIN: parcial em oab_numbers preenchido (sem cast pra evitar não-imutável)
CREATE INDEX IF NOT EXISTS idx_targets_oab_gin
  ON public.monitoring_targets USING GIN (oab_numbers)
  WHERE oab_numbers IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES public.monitoring_targets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed','partial')) DEFAULT 'running',
  total_found INT NOT NULL DEFAULT 0,
  by_tribunal JSONB NOT NULL DEFAULT '{}'::jsonb,
  by_oab JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('initial','periodic_refresh','manual'))
);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_target ON public.discovery_runs(target_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_user ON public.discovery_runs(user_id, started_at DESC);

ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY discovery_runs_self_select ON public.discovery_runs
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.target_process_links
  ADD COLUMN IF NOT EXISTS matched_via TEXT,
  ADD COLUMN IF NOT EXISTS matched_value TEXT,
  ADD COLUMN IF NOT EXISTS first_linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS unlinked_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.target_process_links
    ADD CONSTRAINT target_process_links_unique UNIQUE (target_id, process_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.process_updates
  ADD COLUMN IF NOT EXISTS is_initial_discovery BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_id UUID;

ALTER TABLE public.ingestion_jobs
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'sync';

DO $$ BEGIN
  ALTER TABLE public.ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_kind_chk
    CHECK (kind IN ('sync','lawyer_discovery'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_lawyer
  ON public.ingestion_jobs(scheduled_for)
  WHERE kind = 'lawyer_discovery' AND status IN ('queued','processing');

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.discovery_runs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.discovery_runs REPLICA IDENTITY FULL;