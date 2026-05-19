-- Add is_urgent to processes
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE;

-- Function to classify process urgency
CREATE OR REPLACE FUNCTION public.classify_process_urgency()
RETURNS TRIGGER AS $$
DECLARE
  p_class TEXT := LOWER(COALESCE(NEW.class_name, ''));
  p_subjects TEXT := LOWER(COALESCE(array_to_string(NEW.subject_names, ' '), ''));
BEGIN
  IF p_class ~ 'mandado de segurança|habeas corpus|tutela|liminar|urgente|cautelar' 
     OR p_subjects ~ 'urgente|liminar|tutela|prioridade' THEN
    NEW.is_urgent := TRUE;
  ELSE
    NEW.is_urgent := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for process urgency
DROP TRIGGER IF EXISTS tr_classify_process ON public.processes;
CREATE TRIGGER tr_classify_process
BEFORE INSERT OR UPDATE ON public.processes
FOR EACH ROW
EXECUTE FUNCTION public.classify_process_urgency();

-- Apply to existing processes
UPDATE public.processes SET is_urgent = FALSE; -- Triggers update
