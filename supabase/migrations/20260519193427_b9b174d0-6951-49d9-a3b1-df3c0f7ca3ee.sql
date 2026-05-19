-- Securing trigger functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

REVOKE ALL ON FUNCTION public.enforce_radar_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_radar_limit() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO authenticated, service_role;

-- Securing classification functions
REVOKE ALL ON FUNCTION public.classify_process_urgency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classify_process_urgency() TO authenticated, service_role;

-- If classify_movement_urgency exists (mentioned in linter)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'classify_movement_urgency') THEN
        REVOKE ALL ON FUNCTION public.classify_movement_urgency() FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.classify_movement_urgency() TO authenticated, service_role;
    END IF;
END $$;

-- Ensuring search_path is set for all public functions to prevent hijacking
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.enforce_radar_limit() SET search_path = public;
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.classify_process_urgency() SET search_path = public;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public;
ALTER FUNCTION public.notify_process_update() SET search_path = public;
ALTER FUNCTION public.consume_rate_limit(text, numeric, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.pick_ingestion_jobs(public.ingestion_job_status[], text, int, int) SET search_path = public;
