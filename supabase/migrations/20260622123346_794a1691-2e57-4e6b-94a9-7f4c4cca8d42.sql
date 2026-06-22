
-- =====================================================================
-- A) PERSISTIR PLANO (idempotente, com lock) — chamado pela orquestração TS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.pts_persistir_plano(
  p_vinculo_id uuid,
  p_etapas jsonb,
  p_sessao_ativa jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vinc RECORD;
  v_etapa jsonb;
  v_ne int;
  v_status public.status_etapa_plano;
  v_sessao_id uuid;
  v_ativa_ne int;
  v_etapas_gravadas int := 0;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'entrevistador')) THEN
    RAISE EXCEPTION 'Apenas administradores/entrevistadores podem persistir plano.' USING ERRCODE='42501';
  END IF;

  -- Lock do vínculo (concorrência)
  SELECT * INTO v_vinc FROM assistido_tratamentos WHERE id = p_vinculo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não encontrado.'; END IF;

  -- Upsert das etapas. Preserva histórico: NUNCA sobrescreve etapas terminais.
  FOR v_etapa IN SELECT * FROM jsonb_array_elements(COALESCE(p_etapas,'[]'::jsonb))
  LOOP
    v_ne := (v_etapa->>'numero_etapa')::int;
    v_status := COALESCE(v_etapa->>'status_etapa','prevista')::public.status_etapa_plano;

    INSERT INTO plano_tratamento_sessoes (
      assistido_id, assistido_tratamento_id, tipo_tratamento_id,
      ordem_tratamento, numero_etapa, quantidade_total_do_tratamento,
      status_etapa, data_prevista, data_base_utilizada,
      eh_publico_livre, bloqueado_por_etapa_anterior, origem
    ) VALUES (
      v_vinc.assistido_id, p_vinculo_id, v_vinc.tratamento_id,
      (v_etapa->>'ordem_tratamento')::int, v_ne,
      (v_etapa->>'quantidade_total_do_tratamento')::int,
      v_status, NULLIF(v_etapa->>'data_prevista','')::date,
      NULLIF(v_etapa->>'data_base_utilizada','')::date,
      COALESCE((v_etapa->>'eh_publico_livre')::boolean,false),
      COALESCE((v_etapa->>'bloqueado_por_etapa_anterior')::boolean,false),
      COALESCE(v_etapa->>'origem','plano')
    )
    ON CONFLICT (assistido_tratamento_id, numero_etapa) DO UPDATE SET
      status_etapa = CASE
        WHEN plano_tratamento_sessoes.status_etapa IN ('realizada','ausente','suspensa','cancelada')
          THEN plano_tratamento_sessoes.status_etapa
        ELSE EXCLUDED.status_etapa END,
      data_prevista = CASE
        WHEN plano_tratamento_sessoes.status_etapa IN ('realizada','ausente','suspensa','cancelada')
          THEN plano_tratamento_sessoes.data_prevista
        ELSE EXCLUDED.data_prevista END,
      ordem_tratamento = EXCLUDED.ordem_tratamento,
      quantidade_total_do_tratamento = EXCLUDED.quantidade_total_do_tratamento,
      eh_publico_livre = EXCLUDED.eh_publico_livre,
      bloqueado_por_etapa_anterior = EXCLUDED.bloqueado_por_etapa_anterior,
      updated_at = now();
    v_etapas_gravadas := v_etapas_gravadas + 1;
  END LOOP;

  -- Garante no máximo 1 etapa ativa: rebaixa outras 'ativa' para 'prevista'
  IF p_sessao_ativa IS NOT NULL THEN
    v_ativa_ne := (p_sessao_ativa->>'numero_etapa')::int;

    UPDATE plano_tratamento_sessoes
      SET status_etapa = 'prevista', updated_at = now()
    WHERE assistido_tratamento_id = p_vinculo_id
      AND status_etapa = 'ativa' AND numero_etapa <> v_ativa_ne;

    -- Sessão real ativa idempotente
    SELECT id INTO v_sessao_id FROM agenda_tratamentos_assistido
    WHERE assistido_tratamento_id = p_vinculo_id
      AND data_sessao = (p_sessao_ativa->>'data')::date
      AND status = 'agendado'
    LIMIT 1;

    IF v_sessao_id IS NULL THEN
      INSERT INTO agenda_tratamentos_assistido (
        assistido_id, assistido_tratamento_id, tratamento_id,
        data_sessao, horario, status, registrado_por
      ) VALUES (
        v_vinc.assistido_id, p_vinculo_id, v_vinc.tratamento_id,
        (p_sessao_ativa->>'data')::date, NULLIF(p_sessao_ativa->>'horario','')::time,
        'agendado', v_uid
      ) RETURNING id INTO v_sessao_id;
    END IF;

    UPDATE plano_tratamento_sessoes
      SET status_etapa = 'ativa', agenda_sessao_id = v_sessao_id,
          data_prevista = (p_sessao_ativa->>'data')::date, updated_at = now()
    WHERE assistido_tratamento_id = p_vinculo_id AND numero_etapa = v_ativa_ne
      AND status_etapa NOT IN ('realizada','ausente','suspensa','cancelada');
  END IF;

  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (v_uid, 'plano_tratamento_sessoes', 'PLANO_PERSISTIDO', p_vinculo_id,
    jsonb_build_object('etapas', v_etapas_gravadas, 'sessao_ativa', p_sessao_ativa));

  RETURN jsonb_build_object('success', true, 'etapas', v_etapas_gravadas);
END;
$$;

REVOKE ALL ON FUNCTION public.pts_persistir_plano(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_persistir_plano(uuid,jsonb,jsonb) TO authenticated, service_role;

-- =====================================================================
-- B) REGISTRAR PRESENÇA (novo modelo) — avança a etapa ativa
-- =====================================================================
CREATE OR REPLACE FUNCTION public.pts_registrar_presenca(
  p_vinculo_id uuid,
  p_data date,
  p_registrado_por uuid,
  p_proxima_numero_etapa int DEFAULT NULL,
  p_proxima_data date DEFAULT NULL,
  p_proxima_horario time DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vinc RECORD;
  v_etapa_ativa RECORD;
  v_concluido boolean := false;
  v_sessao_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_vinc FROM assistido_tratamentos WHERE id = p_vinculo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não encontrado.'; END IF;

  -- Histórico (idempotente): presença na mesma data não duplica
  IF NOT EXISTS (SELECT 1 FROM presencas_tratamentos WHERE assistido_tratamento_id = p_vinculo_id AND data = p_data) THEN
    INSERT INTO presencas_tratamentos (assistido_tratamento_id, data, status_presenca, registrado_por)
    VALUES (p_vinculo_id, p_data, 'presente', p_registrado_por);
  END IF;

  -- Etapa ativa → realizada (lock implícito pelo lock do vínculo)
  SELECT * INTO v_etapa_ativa FROM plano_tratamento_sessoes
  WHERE assistido_tratamento_id = p_vinculo_id AND status_etapa = 'ativa'
  ORDER BY numero_etapa LIMIT 1;

  IF FOUND THEN
    UPDATE plano_tratamento_sessoes
      SET status_etapa = 'realizada', updated_at = now()
    WHERE id = v_etapa_ativa.id;

    IF v_etapa_ativa.agenda_sessao_id IS NOT NULL THEN
      UPDATE agenda_tratamentos_assistido SET status = 'realizada', updated_at = now()
      WHERE id = v_etapa_ativa.agenda_sessao_id;
    END IF;
  END IF;

  -- Progresso + estado operacional (idempotente: nunca excede total)
  UPDATE assistido_tratamentos SET
    quantidade_realizada = LEAST(quantidade_realizada + 1, quantidade_total),
    ultima_presenca_em = p_data,
    faltas_consecutivas = 0,
    ultimo_status_operacional = 'presente',
    status = CASE WHEN status = 'aguardando_inicio' THEN 'em_andamento' ELSE status END
  WHERE id = p_vinculo_id;

  SELECT * INTO v_vinc FROM assistido_tratamentos WHERE id = p_vinculo_id;

  IF v_vinc.quantidade_realizada >= v_vinc.quantidade_total THEN
    UPDATE assistido_tratamentos SET status = 'concluido', ultimo_status_operacional = 'concluido'
    WHERE id = p_vinculo_id;
    v_concluido := true;
  ELSIF p_proxima_numero_etapa IS NOT NULL AND p_proxima_data IS NOT NULL THEN
    -- Ativa a próxima etapa criando UMA sessão real
    SELECT id INTO v_sessao_id FROM agenda_tratamentos_assistido
    WHERE assistido_tratamento_id = p_vinculo_id AND data_sessao = p_proxima_data AND status = 'agendado' LIMIT 1;
    IF v_sessao_id IS NULL THEN
      INSERT INTO agenda_tratamentos_assistido (assistido_id, assistido_tratamento_id, tratamento_id, data_sessao, horario, status, registrado_por)
      VALUES (v_vinc.assistido_id, p_vinculo_id, v_vinc.tratamento_id, p_proxima_data, p_proxima_horario, 'agendado', v_uid)
      RETURNING id INTO v_sessao_id;
    END IF;
    UPDATE plano_tratamento_sessoes
      SET status_etapa = 'ativa', agenda_sessao_id = v_sessao_id, data_prevista = p_proxima_data, updated_at = now()
    WHERE assistido_tratamento_id = p_vinculo_id AND numero_etapa = p_proxima_numero_etapa
      AND status_etapa NOT IN ('realizada','ausente','suspensa','cancelada');
  END IF;

  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (v_uid, 'plano_tratamento_sessoes', 'PLANO_PRESENCA_AVANCO', p_vinculo_id,
    jsonb_build_object('data', p_data, 'concluido', v_concluido, 'proxima_etapa', p_proxima_numero_etapa));

  RETURN jsonb_build_object('success', true, 'concluido', v_concluido,
    'quantidade_realizada', v_vinc.quantidade_realizada, 'quantidade_total', v_vinc.quantidade_total);
END;
$$;

REVOKE ALL ON FUNCTION public.pts_registrar_presenca(uuid,date,uuid,int,date,time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_registrar_presenca(uuid,date,uuid,int,date,time) TO authenticated, service_role;

-- =====================================================================
-- C) REGISTRAR AUSÊNCIA (novo modelo) — remarca SÓ a etapa atual
-- =====================================================================
CREATE OR REPLACE FUNCTION public.pts_registrar_ausencia(
  p_vinculo_id uuid,
  p_data date,
  p_registrado_por uuid,
  p_nova_data date DEFAULT NULL,
  p_nova_horario time DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vinc RECORD;
  v_etapa_ativa RECORD;
  v_max_remarc int;
  v_max_faltas int;
  v_max_dias int;
  v_suspender boolean := false;
  v_sessao_id uuid;
  v_nome text;
  v_trat text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_vinc FROM assistido_tratamentos WHERE id = p_vinculo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não encontrado.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM presencas_tratamentos WHERE assistido_tratamento_id = p_vinculo_id AND data = p_data) THEN
    INSERT INTO presencas_tratamentos (assistido_tratamento_id, data, status_presenca, registrado_por)
    VALUES (p_vinculo_id, p_data, 'ausente', p_registrado_por);
  END IF;

  -- Contadores operacionais
  UPDATE assistido_tratamentos SET
    faltas_consecutivas = faltas_consecutivas + 1,
    remarcacoes_automaticas = remarcacoes_automaticas + 1,
    ultimo_status_operacional = 'ausente'
  WHERE id = p_vinculo_id;
  SELECT * INTO v_vinc FROM assistido_tratamentos WHERE id = p_vinculo_id;

  -- Limites parametrizáveis
  SELECT COALESCE(MAX(CASE WHEN chave='tratamento_max_remarcacoes_automaticas' THEN valor::int END),7),
         COALESCE(MAX(CASE WHEN chave='tratamento_max_faltas_consecutivas' THEN valor::int END),3),
         COALESCE(MAX(CASE WHEN chave='tratamento_max_dias_sem_presenca' THEN valor::int END),60)
  INTO v_max_remarc, v_max_faltas, v_max_dias
  FROM regras_operacionais
  WHERE chave IN ('tratamento_max_remarcacoes_automaticas','tratamento_max_faltas_consecutivas','tratamento_max_dias_sem_presenca')
    AND ativo = true;

  v_suspender := (v_vinc.remarcacoes_automaticas >= v_max_remarc)
    OR (v_vinc.faltas_consecutivas >= v_max_faltas)
    OR (v_vinc.ultima_presenca_em IS NOT NULL AND (CURRENT_DATE - v_vinc.ultima_presenca_em) >= v_max_dias);

  SELECT * INTO v_etapa_ativa FROM plano_tratamento_sessoes
  WHERE assistido_tratamento_id = p_vinculo_id AND status_etapa = 'ativa' ORDER BY numero_etapa LIMIT 1;

  SELECT a.nome, tt.nome INTO v_nome, v_trat
  FROM assistidos a LEFT JOIN tipos_tratamento tt ON tt.id = v_vinc.tratamento_id
  WHERE a.id = v_vinc.assistido_id;

  IF v_suspender THEN
    UPDATE assistido_tratamentos SET status = 'suspenso', ultimo_status_operacional = 'suspenso' WHERE id = p_vinculo_id;
    IF FOUND AND v_etapa_ativa.id IS NOT NULL THEN
      UPDATE plano_tratamento_sessoes SET status_etapa = 'suspensa', updated_at = now() WHERE id = v_etapa_ativa.id;
      IF v_etapa_ativa.agenda_sessao_id IS NOT NULL THEN
        UPDATE agenda_tratamentos_assistido SET status = 'cancelado', updated_at = now() WHERE id = v_etapa_ativa.agenda_sessao_id;
      END IF;
    END IF;
    PERFORM fn_enqueue_notificacao('falta_registrada', v_vinc.assistido_id, 'tratamento_suspenso',
      jsonb_build_object('nome', v_nome, 'tratamento', v_trat),
      now(), 'tratamento_suspenso:'||p_vinculo_id||':'||p_data::text);
  ELSE
    -- Remarca SOMENTE a etapa atual para a nova data
    IF v_etapa_ativa.id IS NOT NULL AND p_nova_data IS NOT NULL THEN
      -- Marca a sessão real anterior como ausente (histórico operacional), cria a nova
      IF v_etapa_ativa.agenda_sessao_id IS NOT NULL THEN
        UPDATE agenda_tratamentos_assistido SET status = 'ausente', updated_at = now()
        WHERE id = v_etapa_ativa.agenda_sessao_id;
      END IF;
      SELECT id INTO v_sessao_id FROM agenda_tratamentos_assistido
      WHERE assistido_tratamento_id = p_vinculo_id AND data_sessao = p_nova_data AND status = 'agendado' LIMIT 1;
      IF v_sessao_id IS NULL THEN
        INSERT INTO agenda_tratamentos_assistido (assistido_id, assistido_tratamento_id, tratamento_id, data_sessao, horario, status, registrado_por)
        VALUES (v_vinc.assistido_id, p_vinculo_id, v_vinc.tratamento_id, p_nova_data, p_nova_horario, 'agendado', v_uid)
        RETURNING id INTO v_sessao_id;
      END IF;
      UPDATE plano_tratamento_sessoes
        SET data_prevista = p_nova_data, agenda_sessao_id = v_sessao_id, updated_at = now()
      WHERE id = v_etapa_ativa.id;

      PERFORM fn_enqueue_notificacao('falta_registrada', v_vinc.assistido_id, 'tratamento_ausencia_remarcada',
        jsonb_build_object('nome', v_nome, 'tratamento', v_trat, 'nova_data', p_nova_data),
        now(), 'tratamento_remarca:'||p_vinculo_id||':'||p_data::text);
    END IF;
  END IF;

  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (v_uid, 'plano_tratamento_sessoes', 'PLANO_AUSENCIA_REMARCA', p_vinculo_id,
    jsonb_build_object('data', p_data, 'nova_data', p_nova_data, 'suspenso', v_suspender,
      'faltas_consecutivas', v_vinc.faltas_consecutivas, 'remarcacoes', v_vinc.remarcacoes_automaticas));

  RETURN jsonb_build_object('success', true, 'suspenso', v_suspender,
    'faltas_consecutivas', v_vinc.faltas_consecutivas, 'remarcacoes_automaticas', v_vinc.remarcacoes_automaticas);
END;
$$;

REVOKE ALL ON FUNCTION public.pts_registrar_ausencia(uuid,date,uuid,date,time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_registrar_ausencia(uuid,date,uuid,date,time) TO authenticated, service_role;

-- =====================================================================
-- D) PROTEÇÃO DO FLUXO ANTIGO: não gerar agenda longa para quem já está no novo modelo
-- =====================================================================
CREATE OR REPLACE FUNCTION public.liberar_proximo_tratamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_usa_plano boolean;
BEGIN
  IF NEW.status <> 'concluido' OR OLD.status = 'concluido' THEN
    RETURN NEW;
  END IF;

  -- Novo modelo: a ativação do próximo tratamento é orquestrada pela camada de
  -- serviço (plano previsto + agenda ativa). NÃO gerar agenda longa aqui.
  SELECT usa_agenda_plano INTO v_usa_plano FROM assistidos WHERE id = NEW.assistido_id;
  IF COALESCE(v_usa_plano, false) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_trat FROM tipos_tratamento WHERE id = NEW.tratamento_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

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
$function$;
