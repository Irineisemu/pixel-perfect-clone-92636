
-- touch_updated_at: não precisa SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Revoga EXECUTE público das três funções internas
REVOKE EXECUTE ON FUNCTION public.touch_updated_at()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_radar_limit()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()       FROM PUBLIC, anon, authenticated;
