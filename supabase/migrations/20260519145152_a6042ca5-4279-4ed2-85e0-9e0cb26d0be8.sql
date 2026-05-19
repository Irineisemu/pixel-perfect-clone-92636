-- Revoke public access from sensitive functions
REVOKE EXECUTE ON FUNCTION public.get_tribunal_credential_for_scraper(uuid, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.set_tribunal_credential(text, text, text, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.pick_ingestion_jobs(ingestion_job_status[], text, integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.enforce_radar_limit() FROM public;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, numeric, numeric, numeric) FROM public;
REVOKE EXECUTE ON FUNCTION public.update_credential_validation(uuid, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public;

-- Grant execution to specific roles as needed
GRANT EXECUTE ON FUNCTION public.set_tribunal_credential(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tribunal_credential_for_scraper(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pick_ingestion_jobs(ingestion_job_status[], text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_radar_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_credential_validation(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
