
-- Convert class_codes to text[] to match the UI whitelist (e.g. "Liquidação de Sentença")
ALTER TABLE public.monitoring_targets
  ALTER COLUMN class_codes DROP DEFAULT,
  ALTER COLUMN class_codes TYPE text[] USING ARRAY[]::text[],
  ALTER COLUMN class_codes SET DEFAULT '{}'::text[];

-- Wire up the radar limit + updated_at triggers (functions already exist)
DROP TRIGGER IF EXISTS enforce_radar_limit_trg ON public.monitoring_targets;
CREATE TRIGGER enforce_radar_limit_trg
  BEFORE INSERT OR UPDATE ON public.monitoring_targets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_radar_limit();

DROP TRIGGER IF EXISTS touch_targets_updated_at ON public.monitoring_targets;
CREATE TRIGGER touch_targets_updated_at
  BEFORE UPDATE ON public.monitoring_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_profiles_updated_at ON public.profiles;
CREATE TRIGGER touch_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_alert_configs_updated_at ON public.alert_configs;
CREATE TRIGGER touch_alert_configs_updated_at
  BEFORE UPDATE ON public.alert_configs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create a profile + alert_config row when a user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
