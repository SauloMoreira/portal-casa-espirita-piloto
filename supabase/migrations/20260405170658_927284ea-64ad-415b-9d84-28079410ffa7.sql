
CREATE OR REPLACE FUNCTION public.liberar_proximo_tratamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_trat RECORD;
  v_next_at RECORD;
  v_next_trat RECORD;
  v_last_session_date date;
  v_cursor date;
  v_i integer;
  v_dia_semana integer;
  v_freq_val integer;
  v_freq_unit text;
  v_horario time;
BEGIN
  IF NEW.status <> 'concluido' OR OLD.status = 'concluido' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_trat FROM tipos_tratamento WHERE id = NEW.tratamento_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Find the next non-libre treatment in sequence that is awaiting release
  SELECT at.* INTO v_next_at
  FROM assistido_tratamentos at
  JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
  WHERE at.assistido_id = NEW.assistido_id
    AND at.status = 'aguardando_liberacao'
    AND tt.tratamento_livre = false
    AND (tt.ordem_tratamento IS NOT NULL)
    AND tt.ordem_tratamento > COALESCE(v_trat.ordem_tratamento, 0)
  ORDER BY tt.ordem_tratamento ASC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_next_trat FROM tipos_tratamento WHERE id = v_next_at.tratamento_id;

  SELECT MAX(data_sessao) INTO v_last_session_date
  FROM agenda_tratamentos_assistido
  WHERE assistido_tratamento_id = NEW.id;

  IF v_last_session_date IS NULL THEN
    v_last_session_date := CURRENT_DATE;
  END IF;

  UPDATE assistido_tratamentos
  SET status = 'aguardando_inicio',
      data_inicio = v_last_session_date + 1
  WHERE id = v_next_at.id;

  v_dia_semana := v_next_trat.dia_semana;
  v_freq_val := COALESCE(v_next_trat.frequencia_valor, 1);
  v_freq_unit := COALESCE(v_next_trat.frequencia_unidade, 'semanas');
  v_horario := v_next_trat.horario;

  v_cursor := v_last_session_date + 1;
  IF v_dia_semana IS NOT NULL THEN
    WHILE EXTRACT(DOW FROM v_cursor)::integer <> v_dia_semana LOOP
      v_cursor := v_cursor + 1;
    END LOOP;
  END IF;

  FOR v_i IN 1..v_next_at.quantidade_total LOOP
    INSERT INTO agenda_tratamentos_assistido (
      assistido_id, assistido_tratamento_id, tratamento_id,
      data_sessao, horario, status
    ) VALUES (
      v_next_at.assistido_id, v_next_at.id, v_next_at.tratamento_id,
      v_cursor, v_horario, 'agendado'
    );

    IF v_freq_unit = 'semanas' THEN
      v_cursor := v_cursor + (v_freq_val * 7);
    ELSIF v_freq_unit = 'meses' THEN
      v_cursor := v_cursor + (v_freq_val * 30);
    ELSE
      v_cursor := v_cursor + v_freq_val;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$func$;
