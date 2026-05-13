DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='filed_at') THEN
    ALTER TABLE public.processes ADD COLUMN filed_at TIMESTAMPTZ;
    COMMENT ON COLUMN public.processes.filed_at IS 'Data de ajuizamento (dataAjuizamento DataJud)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='organ_code') THEN
    ALTER TABLE public.processes ADD COLUMN organ_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='organ_name') THEN
    ALTER TABLE public.processes ADD COLUMN organ_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='municipality_ibge') THEN
    ALTER TABLE public.processes ADD COLUMN municipality_ibge BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='secrecy_level') THEN
    ALTER TABLE public.processes ADD COLUMN secrecy_level INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='system_name') THEN
    ALTER TABLE public.processes ADD COLUMN system_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='format_name') THEN
    ALTER TABLE public.processes ADD COLUMN format_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes' AND column_name='last_update_at') THEN
    ALTER TABLE public.processes ADD COLUMN last_update_at TIMESTAMPTZ;
    COMMENT ON COLUMN public.processes.last_update_at IS 'Ultima atualizacao do tribunal';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_processes_filed_at ON public.processes(filed_at DESC NULLS LAST);

UPDATE public.processes SET sync_status = 'pending' WHERE filed_at IS NULL;