CREATE OR REPLACE FUNCTION public.pts_registrar_presenca(p_vinculo_id uuid, p_data date, p_registrado_por uuid, p_proxima_numero_etapa integer DEFAULT NULL::integer, p_proxima_data date DEFAULT NULL::date, p_proxima_horario time without time zone DEFAULT NULL::time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- IDEMPOTÊNCIA REAL: se já existe QUALQUER registro de presença/ausência para esta
  -- data neste vínculo, o evento já foi processado. Não reaplica progressão (evita
  -- avançar etapa em duplicidade por clique duplo / concorrência).
  IF EXISTS (
    SELECT 1 FROM presencas_tratamentos
    WHERE assistido_tratamento_id = p_vinculo_id AND data = p_data
  ) THEN
    RETURN jsonb_build_object('success', true, 'idempotente', true,
      'concluido', (v_vinc.status = 'concluido'),
      'quantidade_realizada', v_vinc.quantidade_realizada,
      'quantidade_total', v_vinc.quantidade_total);
  END IF;

  INSERT INTO presencas_tratamentos (assistido_tratamento_id, data, status_presenca, registrado_por)
  VALUES (p_vinculo_id, p_data, 'presente', p_registrado_por);

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
$function$;

CREATE OR REPLACE FUNCTION public.pts_registrar_ausencia(p_vinculo_id uuid, p_data date, p_registrado_por uuid, p_nova_data date DEFAULT NULL::date, p_nova_horario time without time zone DEFAULT NULL::time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- IDEMPOTÊNCIA REAL: evento da data já processado → não soma faltas/remarcações de novo.
  IF EXISTS (
    SELECT 1 FROM presencas_tratamentos
    WHERE assistido_tratamento_id = p_vinculo_id AND data = p_data
  ) THEN
    RETURN jsonb_build_object('success', true, 'idempotente', true,
      'suspenso', (v_vinc.status = 'suspenso'),
      'faltas_consecutivas', v_vinc.faltas_consecutivas,
      'remarcacoes_automaticas', v_vinc.remarcacoes_automaticas);
  END IF;

  INSERT INTO presencas_tratamentos (assistido_tratamento_id, data, status_presenca, registrado_por)
  VALUES (p_vinculo_id, p_data, 'ausente', p_registrado_por);

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
$function$;