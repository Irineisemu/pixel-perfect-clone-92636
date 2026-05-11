
-- Funções de trigger / utilitárias não precisam ser callable por usuários
REVOKE EXECUTE ON FUNCTION public.notify_process_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_radar_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- pick_ingestion_jobs e consume_rate_limit já são restritos a service_role
REVOKE EXECUTE ON FUNCTION public.pick_ingestion_jobs(public.ingestion_job_status[], text, int, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, numeric, numeric, numeric) FROM anon, authenticated;

-- has_role: anon não precisa, authenticated sim
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
