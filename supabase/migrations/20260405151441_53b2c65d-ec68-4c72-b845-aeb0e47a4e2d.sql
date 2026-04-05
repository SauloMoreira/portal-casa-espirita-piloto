
-- Add tarefeiro_id to tipos_tratamento
ALTER TABLE public.tipos_tratamento 
ADD COLUMN IF NOT EXISTS tarefeiro_id uuid;

-- Add quantidade_palestras to assistidos
ALTER TABLE public.assistidos
ADD COLUMN IF NOT EXISTS quantidade_palestras integer NOT NULL DEFAULT 0;

-- Create trigger function to auto-calculate quantidade_faltante
CREATE OR REPLACE FUNCTION public.calc_quantidade_faltante()
RETURNS TRIGGER AS $$
BEGIN
  NEW.quantidade_faltante := GREATEST(NEW.quantidade_total - NEW.quantidade_realizada, 0);
  IF NEW.quantidade_realizada >= NEW.quantidade_total AND NEW.status = 'em_andamento' THEN
    NEW.status := 'concluido';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_calc_faltante
BEFORE INSERT OR UPDATE ON public.assistido_tratamentos
FOR EACH ROW
EXECUTE FUNCTION public.calc_quantidade_faltante();

-- Create function to register presence and update progress
CREATE OR REPLACE FUNCTION public.registrar_presenca(
  p_assistido_tratamento_id uuid,
  p_data date,
  p_status_presenca text,
  p_registrado_por uuid,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at RECORD;
  v_result jsonb;
BEGIN
  -- Get current assistido_tratamento
  SELECT * INTO v_at FROM assistido_tratamentos WHERE id = p_assistido_tratamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo assistido-tratamento não encontrado';
  END IF;

  -- Check for duplicate presence on same date
  IF EXISTS (
    SELECT 1 FROM presencas_tratamentos 
    WHERE assistido_tratamento_id = p_assistido_tratamento_id AND data = p_data
  ) THEN
    RAISE EXCEPTION 'Presença já registrada para esta data';
  END IF;

  -- Insert presence record
  INSERT INTO presencas_tratamentos (assistido_tratamento_id, data, status_presenca, registrado_por, observacao)
  VALUES (p_assistido_tratamento_id, p_data, p_status_presenca, p_registrado_por, p_observacao);

  -- If present, increment realized count
  IF p_status_presenca = 'presente' THEN
    -- Prevent exceeding total
    IF v_at.quantidade_realizada >= v_at.quantidade_total THEN
      RAISE EXCEPTION 'Quantidade total de sessões já atingida';
    END IF;

    UPDATE assistido_tratamentos
    SET quantidade_realizada = quantidade_realizada + 1,
        status = CASE WHEN status = 'aguardando_inicio' THEN 'em_andamento' ELSE status END
    WHERE id = p_assistido_tratamento_id;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'quantidade_realizada', at2.quantidade_realizada,
    'quantidade_faltante', at2.quantidade_faltante,
    'status', at2.status
  ) INTO v_result
  FROM assistido_tratamentos at2 WHERE at2.id = p_assistido_tratamento_id;

  RETURN v_result;
END;
$$;

-- Allow tarefeiros to update assistido_tratamentos (needed for presence flow via function)
CREATE POLICY "Tarefeiros update assistido_tratamentos"
ON public.assistido_tratamentos
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'tarefeiro'::app_role))
WITH CHECK (has_role(auth.uid(), 'tarefeiro'::app_role));

-- Allow entrevistadores to insert presencas_tratamentos  
CREATE POLICY "Entrevistadores read presencas"
ON public.presencas_tratamentos
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'entrevistador'::app_role));
