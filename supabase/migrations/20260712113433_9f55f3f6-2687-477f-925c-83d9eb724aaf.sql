
CREATE OR REPLACE FUNCTION public.fn_confirmar_agendamento_tratamento(
  p_vinculo_id uuid,
  p_sessoes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_vinculo public.assistido_tratamentos%ROWTYPE;
  v_assistido_inst uuid;
  v_trat record;
  v_saldo integer;
  v_len integer;
  v_first_date date;
  v_last_date date;
  v_expected_diff integer;
  v_holistico boolean;
  v_is_coord boolean;
  v_is_admin_inst boolean;
  v_vinc_ativo boolean;
  v_existing_count integer;
  v_prev_date date;
  v_curr_date date;
  v_curr_horario time;
  v_item jsonb;
  v_keys text[];
  v_updated integer;
  v_matches integer;
  i integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  -- Contrato de p_sessoes
  IF p_sessoes IS NULL OR jsonb_typeof(p_sessoes) <> 'array' THEN
    RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
  END IF;

  v_len := jsonb_array_length(p_sessoes);
  IF v_len = 0 OR v_len > 200 THEN
    RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
  END IF;

  -- Lock canônico do vínculo
  SELECT * INTO v_vinculo
  FROM public.assistido_tratamentos
  WHERE id = p_vinculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  -- Instituição do assistido (fonte de verdade tenant)
  SELECT instituicao_id INTO v_assistido_inst
  FROM public.assistidos
  WHERE id = v_vinculo.assistido_id;

  IF v_assistido_inst IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  -- Autorização: coordenador designado + vínculo institucional ativo, OU admin da instituição
  SELECT EXISTS (
    SELECT 1 FROM public.instituicao_usuarios
    WHERE user_id = v_uid
      AND instituicao_id = v_assistido_inst
      AND status = 'ativo'
  ) INTO v_vinc_ativo;

  v_is_coord := public.has_role(v_uid, 'coordenador_de_tratamento'::app_role)
                AND v_vinc_ativo
                AND public.fn_coordena_tratamento(v_uid, v_vinculo.tratamento_id);

  v_is_admin_inst := public.fn_is_admin_instituicao(v_uid, v_assistido_inst);

  IF NOT (v_is_coord OR v_is_admin_inst) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  -- Tratamento (regra canônica de cronograma)
  SELECT tipo, dia_semana, horario, frequencia_valor, frequencia_unidade
  INTO v_trat
  FROM public.tipos_tratamento
  WHERE id = v_vinculo.tratamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  v_holistico := lower(coalesce(v_trat.tipo, '')) IN ('holistico', 'holístico');

  -- Saldo canônico
  v_saldo := GREATEST(v_vinculo.quantidade_total - v_vinculo.quantidade_realizada, 0);
  IF v_saldo <= 0 THEN
    RAISE EXCEPTION 'STATUS_NAO_PERMITE_AGENDAMENTO' USING ERRCODE = '22023';
  END IF;

  IF v_len <> v_saldo THEN
    RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
  END IF;

  -- Validar cada item: chaves exatas, tipos, ordem, unicidade, futuro, dia_semana, frequência, horário holístico
  v_prev_date := NULL;
  FOR i IN 0 .. v_len - 1 LOOP
    v_item := p_sessoes -> i;
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(k ORDER BY k) INTO v_keys FROM jsonb_object_keys(v_item) k;
    IF v_keys IS DISTINCT FROM ARRAY['data_sessao','horario']::text[] THEN
      RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_curr_date := (v_item ->> 'data_sessao')::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
    END;

    IF (v_item ->> 'horario') IS NULL THEN
      v_curr_horario := NULL;
    ELSE
      BEGIN
        v_curr_horario := (v_item ->> 'horario')::time;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
      END;
    END IF;

    IF v_holistico AND v_curr_horario IS NULL THEN
      RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
    END IF;

    IF v_curr_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
    END IF;

    IF v_prev_date IS NOT NULL THEN
      IF v_curr_date <= v_prev_date THEN
        RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
      END IF;

      -- Coerência com frequência
      IF v_trat.frequencia_valor IS NOT NULL AND v_trat.frequencia_unidade IS NOT NULL THEN
        v_expected_diff := CASE lower(v_trat.frequencia_unidade)
          WHEN 'dias'    THEN v_trat.frequencia_valor
          WHEN 'semanas' THEN v_trat.frequencia_valor * 7
          WHEN 'meses'   THEN NULL -- meses variam, checamos abaixo
          ELSE NULL
        END;

        IF v_expected_diff IS NOT NULL THEN
          IF (v_curr_date - v_prev_date) <> v_expected_diff THEN
            RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
          END IF;
        ELSIF lower(v_trat.frequencia_unidade) = 'meses' THEN
          IF v_curr_date <> (v_prev_date + (v_trat.frequencia_valor || ' months')::interval)::date THEN
            RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
          END IF;
        END IF;
      END IF;
    ELSE
      v_first_date := v_curr_date;
      IF v_trat.dia_semana IS NOT NULL
         AND EXTRACT(DOW FROM v_curr_date)::int <> v_trat.dia_semana THEN
        RAISE EXCEPTION 'PAYLOAD_INVALIDO' USING ERRCODE = '22023';
      END IF;
    END IF;

    v_prev_date := v_curr_date;
    v_last_date := v_curr_date;
  END LOOP;

  -- Sessões existentes deste vínculo
  SELECT count(*) INTO v_existing_count
  FROM public.agenda_tratamentos_assistido
  WHERE assistido_tratamento_id = v_vinculo.id;

  -- Idempotência exclusiva: aguardando_inicio + sessões batendo exatamente com o payload
  IF v_vinculo.status = 'aguardando_inicio' AND v_existing_count = v_len THEN
    SELECT count(*) INTO v_matches
    FROM public.agenda_tratamentos_assistido a
    JOIN LATERAL jsonb_array_elements(p_sessoes) s ON
      a.data_sessao = (s ->> 'data_sessao')::date
      AND a.horario IS NOT DISTINCT FROM NULLIF(s ->> 'horario','')::time
    WHERE a.assistido_tratamento_id = v_vinculo.id;

    IF v_matches = v_len THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_committed', true,
        'status', 'aguardando_inicio',
        'data_inicio', v_vinculo.data_inicio,
        'sessoes_criadas', 0
      );
    END IF;

    RAISE EXCEPTION 'SESSOES_INCONSISTENTES' USING ERRCODE = '22023';
  END IF;

  -- Qualquer combinação status+agenda que não seja o caminho normal é inconsistência
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'SESSOES_INCONSISTENTES' USING ERRCODE = '22023';
  END IF;

  IF v_vinculo.status <> 'aguardando_agendamento' THEN
    RAISE EXCEPTION 'STATUS_NAO_PERMITE_AGENDAMENTO' USING ERRCODE = '22023';
  END IF;

  -- INSERT bulk das sessões
  INSERT INTO public.agenda_tratamentos_assistido (
    assistido_id, assistido_tratamento_id, tratamento_id,
    data_sessao, horario, status, registrado_por
  )
  SELECT
    v_vinculo.assistido_id,
    v_vinculo.id,
    v_vinculo.tratamento_id,
    (s ->> 'data_sessao')::date,
    NULLIF(s ->> 'horario','')::time,
    'agendado',
    v_uid
  FROM jsonb_array_elements(p_sessoes) s;

  -- UPDATE do vínculo
  UPDATE public.assistido_tratamentos
  SET status = 'aguardando_inicio',
      data_inicio = v_first_date,
      agendado_por = v_uid
  WHERE id = v_vinculo.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'AGENDAMENTO_TRATAMENTO_COMMIT_FAILED' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_committed', false,
    'status', 'aguardando_inicio',
    'data_inicio', v_first_date,
    'sessoes_criadas', v_len
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_confirmar_agendamento_tratamento(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_confirmar_agendamento_tratamento(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_confirmar_agendamento_tratamento(uuid, jsonb) TO authenticated;
