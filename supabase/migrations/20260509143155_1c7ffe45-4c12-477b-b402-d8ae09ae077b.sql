
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== ENUMS =====
CREATE TYPE public.target_type AS ENUM ('person', 'process', 'radar');
CREATE TYPE public.party_polo AS ENUM ('ativo', 'passivo');
CREATE TYPE public.movement_urgency AS ENUM ('critical', 'high', 'medium', 'info');
CREATE TYPE public.notification_channel AS ENUM ('email', 'whatsapp');
CREATE TYPE public.notification_frequency AS ENUM ('instant', 'daily', 'weekly');
CREATE TYPE public.notification_status AS ENUM ('queued', 'sent', 'failed', 'dead_letter');
CREATE TYPE public.tribunal_sphere AS ENUM ('estadual', 'federal', 'trabalho', 'eleitoral', 'militar', 'superior');
CREATE TYPE public.tribunal_status AS ENUM ('active', 'delayed', 'offline');

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  oab text,
  phone_enc bytea,        -- criptografado AES-GCM via pgcrypto
  email_enc bytea,
  tz text NOT NULL DEFAULT 'America/Sao_Paulo',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== TRIBUNALS =====
CREATE TABLE public.tribunals (
  alias text PRIMARY KEY,                    -- ex: 'api_publica_tjsp'
  name text NOT NULL,
  sphere public.tribunal_sphere NOT NULL,
  status public.tribunal_status NOT NULL DEFAULT 'active',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== MONITORING TARGETS =====
CREATE TABLE public.monitoring_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.target_type NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- pessoa
  full_name text,
  cpf_enc bytea,
  cpf_hash text,                             -- SHA-256 do CPF normalizado para match exato sem decifrar
  oab text,
  qualification text,
  aliases text[] DEFAULT '{}',
  -- processo
  process_number text,
  tribunal_alias text REFERENCES public.tribunals(alias),
  nickname text,
  -- radar
  tribunal_aliases text[] DEFAULT '{}',
  class_codes int[] DEFAULT '{}',
  keywords text[] DEFAULT '{}',
  against_state_only boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_person_has_name CHECK (type <> 'person' OR full_name IS NOT NULL),
  CONSTRAINT chk_process_has_number CHECK (type <> 'process' OR process_number IS NOT NULL)
);
CREATE INDEX idx_targets_user_active ON public.monitoring_targets(user_id, is_active);
CREATE INDEX idx_targets_process_number ON public.monitoring_targets(process_number) WHERE type = 'process';
CREATE INDEX idx_targets_cpf_hash ON public.monitoring_targets(cpf_hash) WHERE cpf_hash IS NOT NULL;

-- Trigger: limite de 5 radares ativos por usuário
CREATE OR REPLACE FUNCTION public.enforce_radar_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NEW.type = 'radar' AND NEW.is_active = true THEN
    SELECT COUNT(*) INTO v_count
    FROM public.monitoring_targets
    WHERE user_id = NEW.user_id
      AND type = 'radar'
      AND is_active = true
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF v_count >= 5 THEN
      RAISE EXCEPTION 'Limite de 5 radares ativos por usuário atingido' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_radar_limit
BEFORE INSERT OR UPDATE ON public.monitoring_targets
FOR EACH ROW EXECUTE FUNCTION public.enforce_radar_limit();

-- ===== PROCESSES =====
CREATE TABLE public.processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_number text NOT NULL UNIQUE,
  tribunal_alias text NOT NULL REFERENCES public.tribunals(alias),
  class_code int,
  subject_codes int[] DEFAULT '{}',
  parties_json jsonb,
  last_known_movements_hash text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_processes_tribunal ON public.processes(tribunal_alias);

-- ===== PARTIES =====
CREATE TABLE public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  polo public.party_polo NOT NULL,
  name_normalized text NOT NULL,
  cpf_hash text,
  cnpj text,
  qualification text,
  is_state boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_parties_process ON public.parties(process_id);
CREATE INDEX idx_parties_name ON public.parties(name_normalized);
CREATE INDEX idx_parties_cpf_hash ON public.parties(cpf_hash) WHERE cpf_hash IS NOT NULL;

-- ===== MOVEMENTS =====
CREATE TABLE public.movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  cnj_movement_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  code int,
  text text,
  urgency public.movement_urgency NOT NULL DEFAULT 'info',
  classification_reasons jsonb DEFAULT '[]',
  match_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_id, cnj_movement_id)
);
CREATE INDEX idx_movements_process_occurred ON public.movements(process_id, occurred_at DESC);
CREATE INDEX idx_movements_urgency_occurred ON public.movements(urgency, occurred_at DESC);

-- ===== TARGET <-> PROCESS =====
CREATE TABLE public.target_process_links (
  target_id uuid NOT NULL REFERENCES public.monitoring_targets(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_id, process_id)
);
CREATE INDEX idx_tpl_process ON public.target_process_links(process_id);

-- ===== ALERT CONFIGS =====
CREATE TABLE public.alert_configs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  channels public.notification_channel[] NOT NULL DEFAULT ARRAY['email']::public.notification_channel[],
  frequency public.notification_frequency NOT NULL DEFAULT 'instant',
  digest_hour int NOT NULL DEFAULT 8 CHECK (digest_hour BETWEEN 0 AND 23),
  digest_dow int NOT NULL DEFAULT 1 CHECK (digest_dow BETWEEN 0 AND 6),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== NOTIFICATIONS LOG =====
CREATE TABLE public.notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movement_id uuid NOT NULL REFERENCES public.movements(id) ON DELETE CASCADE,
  channel public.notification_channel NOT NULL,
  status public.notification_status NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  sent_at timestamptz,
  masked_recipient text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, movement_id, channel)
);
CREATE INDEX idx_notif_user ON public.notifications_log(user_id, created_at DESC);

-- ===== updated_at touch =====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_targets_touch  BEFORE UPDATE ON public.monitoring_targets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_alerts_touch   BEFORE UPDATE ON public.alert_configs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== Auto-create profile + alert_config on signup =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name) VALUES (NEW.id, NEW.raw_user_meta_data->>'name');
  INSERT INTO public.alert_configs (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== RLS =====
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribunals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_targets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_process_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_configs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_log   ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- tribunals: leitura pública para autenticados
CREATE POLICY "tribunals_read" ON public.tribunals FOR SELECT TO authenticated USING (true);

-- monitoring_targets
CREATE POLICY "targets_select" ON public.monitoring_targets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "targets_insert" ON public.monitoring_targets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "targets_update" ON public.monitoring_targets FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "targets_delete" ON public.monitoring_targets FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- processes/parties/movements: visíveis se o usuário tem algum target ligado
CREATE POLICY "processes_via_links" ON public.processes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.target_process_links l
  JOIN public.monitoring_targets t ON t.id = l.target_id
  WHERE l.process_id = processes.id AND t.user_id = auth.uid()
));

CREATE POLICY "parties_via_process" ON public.parties FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.target_process_links l
  JOIN public.monitoring_targets t ON t.id = l.target_id
  WHERE l.process_id = parties.process_id AND t.user_id = auth.uid()
));

CREATE POLICY "movements_via_process" ON public.movements FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.target_process_links l
  JOIN public.monitoring_targets t ON t.id = l.target_id
  WHERE l.process_id = movements.process_id AND t.user_id = auth.uid()
));

-- target_process_links
CREATE POLICY "tpl_select" ON public.target_process_links FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.monitoring_targets t WHERE t.id = target_id AND t.user_id = auth.uid()));

-- alert_configs
CREATE POLICY "alerts_select" ON public.alert_configs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "alerts_update" ON public.alert_configs FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "alerts_insert" ON public.alert_configs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- notifications_log
CREATE POLICY "notif_select" ON public.notifications_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
