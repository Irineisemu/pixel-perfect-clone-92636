
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.tribunal_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tribunal_alias text NOT NULL,
  oab_number text NOT NULL,
  oab_uf text NOT NULL,
  password_enc bytea NOT NULL,
  last_validated_at timestamptz,
  last_validation_status text,
  last_validation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tribunal_alias)
);

ALTER TABLE public.tribunal_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY tc_select ON public.tribunal_credentials
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY tc_delete ON public.tribunal_credentials
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- INSERT/UPDATE só via função set_tribunal_credential (security definer)
-- Não criamos policies de insert/update para forçar passar pela RPC.

CREATE TRIGGER tc_touch
  BEFORE UPDATE ON public.tribunal_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.set_tribunal_credential(
  _tribunal text,
  _oab_number text,
  _oab_uf text,
  _password text,
  _key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _key IS NULL OR length(_key) < 16 THEN
    RAISE EXCEPTION 'invalid_encryption_key';
  END IF;
  IF _password IS NULL OR length(_password) < 4 THEN
    RAISE EXCEPTION 'invalid_password';
  END IF;

  INSERT INTO public.tribunal_credentials (user_id, tribunal_alias, oab_number, oab_uf, password_enc)
  VALUES (v_user, _tribunal, _oab_number, upper(_oab_uf), pgp_sym_encrypt(_password, _key))
  ON CONFLICT (user_id, tribunal_alias) DO UPDATE
    SET oab_number = EXCLUDED.oab_number,
        oab_uf = EXCLUDED.oab_uf,
        password_enc = EXCLUDED.password_enc,
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tribunal_credential(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tribunal_credential(text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tribunal_credential_for_scraper(
  _user_id uuid,
  _tribunal text,
  _key text
) RETURNS TABLE (oab_number text, oab_uf text, password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT tc.oab_number,
         tc.oab_uf,
         pgp_sym_decrypt(tc.password_enc, _key)::text
  FROM public.tribunal_credentials tc
  WHERE tc.user_id = _user_id AND tc.tribunal_alias = _tribunal;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tribunal_credential_for_scraper(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tribunal_credential_for_scraper(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_credential_validation(
  _credential_id uuid,
  _status text,
  _error text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tribunal_credentials
    SET last_validated_at = now(),
        last_validation_status = _status,
        last_validation_error = _error
    WHERE id = _credential_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_credential_validation(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_credential_validation(uuid,text,text) TO service_role;

CREATE INDEX IF NOT EXISTS ingestion_jobs_status_sched_idx
  ON public.ingestion_jobs (status, scheduled_for);

CREATE INDEX IF NOT EXISTS ingestion_jobs_target_ids_gin
  ON public.ingestion_jobs USING gin (target_ids);
