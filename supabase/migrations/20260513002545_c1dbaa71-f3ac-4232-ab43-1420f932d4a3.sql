-- 1. source_type em monitoring_targets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='monitoring_targets' AND column_name='source_type'
  ) THEN
    ALTER TABLE public.monitoring_targets ADD COLUMN source_type TEXT DEFAULT 'manual_number';
  END IF;
END $$;

-- 2. Colunas extras em processes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='class_name') THEN
    ALTER TABLE public.processes ADD COLUMN class_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='subject_names') THEN
    ALTER TABLE public.processes ADD COLUMN subject_names TEXT[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='instance') THEN
    ALTER TABLE public.processes ADD COLUMN instance INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='sync_status') THEN
    ALTER TABLE public.processes ADD COLUMN sync_status TEXT DEFAULT 'pending'
      CHECK (sync_status IN ('pending','synced','failed','not_found'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='last_movement_at') THEN
    ALTER TABLE public.processes ADD COLUMN last_movement_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='total_movements') THEN
    ALTER TABLE public.processes ADD COLUMN total_movements INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='new_movements_count') THEN
    ALTER TABLE public.processes ADD COLUMN new_movements_count INT DEFAULT 0;
  END IF;
END $$;

-- Garantir UNIQUE em processes.process_number para os upserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'processes_process_number_key'
  ) THEN
    BEGIN
      ALTER TABLE public.processes ADD CONSTRAINT processes_process_number_key UNIQUE (process_number);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      NULL;
    END;
  END IF;
END $$;

-- 3. process_movements
CREATE TABLE IF NOT EXISTS public.process_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  movement_code INT,
  movement_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  organ_code TEXT,
  organ_name TEXT,
  complements JSONB,
  raw_data JSONB,
  is_new BOOLEAN DEFAULT true,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT process_movements_unique UNIQUE (process_id, movement_code, occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_pm_process ON public.process_movements(process_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_new ON public.process_movements(is_new, created_at DESC) WHERE is_new = true;

ALTER TABLE public.process_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_select_own" ON public.process_movements;
CREATE POLICY "pm_select_own"
  ON public.process_movements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.target_process_links tpl
      JOIN public.monitoring_targets mt ON mt.id = tpl.target_id
      WHERE tpl.process_id = process_movements.process_id
        AND mt.user_id = auth.uid()
        AND tpl.unlinked_at IS NULL
    )
  );