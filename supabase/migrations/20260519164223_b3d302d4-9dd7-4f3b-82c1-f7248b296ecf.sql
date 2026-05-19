-- Add columns if they don't exist
ALTER TABLE public.process_movements 
ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'info',
ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE;

-- Create classification function
CREATE OR REPLACE FUNCTION public.classify_movement_urgency()
RETURNS TRIGGER AS $$
DECLARE
  m_name TEXT := LOWER(NEW.movement_name);
BEGIN
  -- Default
  NEW.urgency := 'info';
  NEW.deadline := NULL;

  -- Critical: Liminar, Tutela, Urgente
  IF m_name ~ 'urgente|liminar|tutela|imediato|decisao interlocutoria|determino|intimação' THEN
    NEW.urgency := 'critical';
    
    -- Se tiver "prazo" no nome, tenta estimar ou marcar que tem prazo
    IF m_name ~ 'prazo' THEN
      -- Por padrão, se não detectamos o prazo exato, podemos deixar NULL ou setar +48h como exemplo
      -- Mas melhor deixar NULL se não for extraído.
    END IF;
  
  -- High: Despacho, Conclusão, Expedição
  ELSIF m_name ~ 'despacho|conclusao|expedicao|mandado|citacao' THEN
    NEW.urgency := 'high';
  
  -- Medium: Petição, Juntada
  ELSIF m_name ~ 'peticao|juntada|manifestacao' THEN
    NEW.urgency := 'medium';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS tr_classify_movement ON public.process_movements;
CREATE TRIGGER tr_classify_movement
BEFORE INSERT OR UPDATE ON public.process_movements
FOR EACH ROW
EXECUTE FUNCTION public.classify_movement_urgency();

-- Apply to existing data
UPDATE public.process_movements SET urgency = 'info' WHERE urgency IS NULL;
