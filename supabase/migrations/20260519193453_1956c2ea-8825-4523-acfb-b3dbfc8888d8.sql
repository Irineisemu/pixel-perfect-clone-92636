-- 1. Fix missing search_path for classify_movement_urgency
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'classify_movement_urgency') THEN
        ALTER FUNCTION public.classify_movement_urgency() SET search_path = public;
    END IF;
END $$;

-- 2. Blanket revoke from PUBLIC on all SECURITY DEFINER functions in public schema
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public' AND p.prosecdef = true
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', func_record.proname, func_record.args);
    END LOOP;
END $$;

-- 3. Restore necessary grants for SECURITY DEFINER functions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_radar_limit() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pick_ingestion_jobs(public.ingestion_job_status[], text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_credential_validation(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tribunal_credential_for_scraper(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_tribunal_credential(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, numeric, numeric, numeric) TO service_role;

-- 4. Move extensions to a dedicated schema (best practice)
CREATE SCHEMA IF NOT EXISTS extensions;
-- Note: Moving existing extensions can be tricky if they are used in many places.
-- We'll just ensure future ones go there and pgcrypto is moved if possible.
-- ALTER EXTENSION pgcrypto SET SCHEMA extensions; -- This might fail if public is not in search_path elsewhere.
-- For now, we'll just set the search_path for functions that use them.
