CREATE OR REPLACE FUNCTION public.agenda_validar_horario_holistico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tipo text;
BEGIN
  IF NEW.status = 'agendado' AND NEW.horario IS NULL THEN
    SELECT tt.tipo INTO v_tipo
    FROM tipos_tratamento tt
    WHERE tt.id = NEW.tratamento_id;

    IF v_tipo = 'holistico' THEN
      RAISE EXCEPTION 'Tratamentos holísticos exigem o horário da consulta.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_validar_horario_holistico ON public.agenda_tratamentos_assistido;

CREATE TRIGGER trg_agenda_validar_horario_holistico
BEFORE INSERT ON public.agenda_tratamentos_assistido
FOR EACH ROW
EXECUTE FUNCTION public.agenda_validar_horario_holistico();