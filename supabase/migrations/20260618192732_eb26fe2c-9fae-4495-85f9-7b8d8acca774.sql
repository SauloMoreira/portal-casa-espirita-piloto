-- Allow tarefeiros to view scheduled interviews (read availability / agenda)
CREATE POLICY "Tarefeiros read entrevistas"
ON public.entrevistas_fraternas
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'tarefeiro'::app_role));

-- Centralized, role-scoped scheduling of an interview.
-- Allows admin, entrevistador and tarefeiro to CREATE (schedule) an interview
-- and move the assistido to "entrevista_agendada", WITHOUT granting broad
-- write access over the assistidos record or the ability to "realizar" / designate
-- treatments (which remains with entrevistador/admin).
CREATE OR REPLACE FUNCTION public.agendar_entrevista_fraterna(
  _assistido_id uuid,
  _data timestamptz,
  _tipo text,
  _observacoes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF NOT (
    has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'entrevistador'::app_role)
    OR has_role(v_uid, 'tarefeiro'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para agendar entrevista';
  END IF;

  IF _tipo NOT IN ('regular', 'livre') THEN
    RAISE EXCEPTION 'Tipo de entrevista inválido';
  END IF;

  INSERT INTO public.entrevistas_fraternas (
    assistido_id, entrevistador_id, data, tipo_entrevista, observacoes, status
  ) VALUES (
    _assistido_id, v_uid, _data, _tipo, NULLIF(_observacoes, ''), 'agendada'
  )
  RETURNING id INTO v_id;

  UPDATE public.assistidos
  SET status = 'entrevista_agendada'
  WHERE id = _assistido_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agendar_entrevista_fraterna(uuid, timestamptz, text, text) TO authenticated;