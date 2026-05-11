
-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'operator', 'user');

CREATE TYPE public.ingestion_job_status AS ENUM (
  'queued', 'processing', 'needs_scraping', 'done', 'failed', 'dead_letter'
);

CREATE TYPE public.ingestion_source AS ENUM ('datajud', 'tjsp_esaj', 'manual');

CREATE TYPE public.circuit_breaker_state AS ENUM ('closed', 'open', 'half_open');

-- =========================================================================
-- USER ROLES (segurança)
-- =========================================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "user_roles_admin_select" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- INGESTION JOBS (fila durável)
-- =========================================================================
CREATE TABLE public.ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_number text NOT NULL,
  tribunal text NOT NULL,
  target_ids uuid[] NOT NULL DEFAULT '{}',
  priority smallint NOT NULL DEFAULT 5,
  status public.ingestion_job_status NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  locked_by text,
  locked_until timestamptz,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_error_kind text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ingestion_jobs_pickup
  ON public.ingestion_jobs (status, scheduled_for)
  WHERE status IN ('queued', 'needs_scraping');

CREATE INDEX idx_ingestion_jobs_process ON public.ingestion_jobs (process_number, tribunal);
CREATE INDEX idx_ingestion_jobs_status ON public.ingestion_jobs (status);

CREATE TRIGGER tg_ingestion_jobs_touch
  BEFORE UPDATE ON public.ingestion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- RAW PAYLOADS (cold storage no Postgres para o lado Lovable)
-- =========================================================================
CREATE TABLE public.raw_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.ingestion_source NOT NULL,
  process_number text NOT NULL,
  tribunal text NOT NULL,
  payload jsonb NOT NULL,
  latency_ms int,
  http_status int,
  correlation_id uuid,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.raw_payloads ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_raw_payloads_lookup
  ON public.raw_payloads (process_number, fetched_at DESC);
CREATE INDEX idx_raw_payloads_source ON public.raw_payloads (source, fetched_at DESC);

-- =========================================================================
-- CIRCUIT BREAKERS
-- =========================================================================
CREATE TABLE public.circuit_breakers (
  adapter text PRIMARY KEY,
  state public.circuit_breaker_state NOT NULL DEFAULT 'closed',
  failure_count int NOT NULL DEFAULT 0,
  failure_window_started_at timestamptz,
  opened_at timestamptz,
  half_open_probe_at timestamptz,
  last_outcome text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.circuit_breakers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tg_circuit_breakers_touch
  BEFORE UPDATE ON public.circuit_breakers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Admins veem o estado dos breakers
CREATE POLICY "breakers_admin_read" ON public.circuit_breakers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- PROCESS UPDATES (eventos canônicos)
-- =========================================================================
CREATE TABLE public.process_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid,
  process_number text NOT NULL,
  tribunal text NOT NULL,
  source public.ingestion_source NOT NULL,
  canonical jsonb NOT NULL,
  movements_diff jsonb NOT NULL DEFAULT '[]'::jsonb,
  movements_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.process_updates ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_process_updates_process ON public.process_updates (process_id, created_at DESC);
CREATE INDEX idx_process_updates_hash ON public.process_updates (process_number, movements_hash);

CREATE OR REPLACE FUNCTION public.notify_process_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify('process_updated', NEW.id::text);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_process_update() FROM PUBLIC;

CREATE TRIGGER tg_process_updates_notify
  AFTER INSERT ON public.process_updates
  FOR EACH ROW EXECUTE FUNCTION public.notify_process_update();

-- Usuário vê eventos de seus targets
CREATE POLICY "process_updates_via_target" ON public.process_updates
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.target_process_links l
      JOIN public.monitoring_targets t ON t.id = l.target_id
      WHERE l.process_id = process_updates.process_id
        AND t.user_id = auth.uid()
    )
  );

-- =========================================================================
-- DATAJUD CACHE
-- =========================================================================
CREATE TABLE public.datajud_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.datajud_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_datajud_cache_expires ON public.datajud_cache (expires_at);

-- =========================================================================
-- RATE LIMIT BUCKETS (token bucket distribuído)
-- =========================================================================
CREATE TABLE public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  tokens numeric NOT NULL,
  capacity numeric NOT NULL,
  refill_per_sec numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Função atômica: tenta consumir N tokens, retorna true se conseguiu
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _key text,
  _capacity numeric,
  _refill_per_sec numeric,
  _tokens numeric DEFAULT 1
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.rate_limit_buckets%ROWTYPE;
  v_new_tokens numeric;
BEGIN
  INSERT INTO public.rate_limit_buckets (bucket_key, tokens, capacity, refill_per_sec, updated_at)
  VALUES (_key, _capacity, _capacity, _refill_per_sec, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT * INTO v_row FROM public.rate_limit_buckets
  WHERE bucket_key = _key FOR UPDATE;

  v_new_tokens := LEAST(
    v_row.capacity,
    v_row.tokens + EXTRACT(EPOCH FROM (v_now - v_row.updated_at)) * v_row.refill_per_sec
  );

  IF v_new_tokens >= _tokens THEN
    UPDATE public.rate_limit_buckets
      SET tokens = v_new_tokens - _tokens,
          updated_at = v_now,
          capacity = _capacity,
          refill_per_sec = _refill_per_sec
      WHERE bucket_key = _key;
    RETURN true;
  ELSE
    UPDATE public.rate_limit_buckets
      SET tokens = v_new_tokens, updated_at = v_now
      WHERE bucket_key = _key;
    RETURN false;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, numeric, numeric, numeric) TO service_role;

-- =========================================================================
-- PICK JOBS atômico (FOR UPDATE SKIP LOCKED)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.pick_ingestion_jobs(
  _statuses public.ingestion_job_status[],
  _worker text,
  _lock_seconds int DEFAULT 60,
  _limit int DEFAULT 10
) RETURNS SETOF public.ingestion_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.ingestion_jobs
    WHERE status = ANY(_statuses)
      AND scheduled_for <= now()
      AND (locked_until IS NULL OR locked_until < now())
    ORDER BY priority ASC, scheduled_for ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ingestion_jobs j
     SET status = 'processing',
         locked_by = _worker,
         locked_until = now() + make_interval(secs => _lock_seconds),
         attempts = j.attempts + 1,
         updated_at = now()
   FROM picked
   WHERE j.id = picked.id
   RETURNING j.*;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pick_ingestion_jobs(public.ingestion_job_status[], text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_ingestion_jobs(public.ingestion_job_status[], text, int, int) TO service_role;

-- =========================================================================
-- PROCESSES: adicionar campo de auditoria
-- =========================================================================
ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS last_source_used public.ingestion_source;

-- =========================================================================
-- PG_CRON / PG_NET (extensions)
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
