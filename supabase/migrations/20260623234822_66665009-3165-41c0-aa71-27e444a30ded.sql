
-- 1) Interruptor de contenção rápida (kill switch), ligado por padrão
INSERT INTO public.regras_operacionais (chave, valor, descricao)
VALUES (
  'excecao_notificacao_ativa',
  'true',
  'Liberação monitorada: liga/desliga a notificação automática por exceção operacional. Defina como false para contenção imediata (pausa fluxo imediato e reconciliação no cron) sem afetar a agenda já registrada.'
)
ON CONFLICT (chave) DO NOTHING;

-- 2) Gate de contenção dentro do processamento oficial
CREATE OR REPLACE FUNCTION public.fn_processar_excecao_notificacoes(p_excecao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e record;
  t record;
  v_tipo text;
  v_event public.notif_evento;
  v_template text;
  v_dedupe text;
  v_payload jsonb;
  v_count int := 0;
  v_fallback int := 0;
  v_nova_data date;
  v_novo_horario time;
  v_nova_ts timestamptz;
BEGIN
  SELECT * INTO e FROM excecoes_operacionais WHERE id = p_excecao_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('erro', 'excecao_inexistente'); END IF;
  IF e.ativo = false THEN RETURN jsonb_build_object('ignorado', 'excecao_inativa'); END IF;

  -- Contenção rápida (rollout monitorado): se o interruptor estiver desligado,
  -- não aplica efeito de agenda nem enfileira comunicação.
  IF lower(coalesce((SELECT valor FROM regras_operacionais WHERE chave = 'excecao_notificacao_ativa'), 'true')) <> 'true' THEN
    RETURN jsonb_build_object('contido', 'rollout_pausado');
  END IF;

  IF e.status = 'remarcado' AND e.nova_data IS NOT NULL THEN
    v_tipo := 'remarcacao';
    v_nova_data := e.nova_data;
    v_novo_horario := e.novo_horario;
  ELSE
    v_tipo := 'cancelamento';
  END IF;

  PERFORM set_config('app.excecao_ctx', '1', true);

  FOR t IN SELECT * FROM fn_excecao_alvos(p_excecao_id) LOOP
    IF t.usou_fallback_nome THEN v_fallback := v_fallback + 1; END IF;

    IF t.dominio = 'tratamento' THEN
      v_event := (CASE WHEN v_tipo='remarcacao' THEN 'sessao_remarcada_por_excecao' ELSE 'sessao_cancelada_por_excecao' END)::public.notif_evento;
      v_template := CASE WHEN v_tipo='remarcacao' THEN 'sessao_remarcada_excecao' ELSE 'sessao_cancelada_excecao' END;
    ELSIF t.dominio = 'entrevista' THEN
      v_event := (CASE WHEN v_tipo='remarcacao' THEN 'entrevista_remarcada_por_excecao' ELSE 'entrevista_cancelada_por_excecao' END)::public.notif_evento;
      v_template := CASE WHEN v_tipo='remarcacao' THEN 'entrevista_remarcada_excecao' ELSE 'entrevista_cancelada_excecao' END;
    ELSE
      v_event := (CASE WHEN v_tipo='remarcacao' THEN 'publico_remarcado_por_excecao' ELSE 'publico_cancelado_por_excecao' END)::public.notif_evento;
      v_template := CASE WHEN v_tipo='remarcacao' THEN 'publico_remarcado_excecao' ELSE 'publico_cancelado_excecao' END;
    END IF;

    IF t.dominio = 'tratamento' THEN
      IF v_tipo = 'cancelamento' THEN
        UPDATE agenda_tratamentos_assistido
          SET status = 'cancelado', updated_at = now()
          WHERE id = t.sessao_ref AND status = 'agendado';
      ELSE
        UPDATE agenda_tratamentos_assistido
          SET data_sessao = v_nova_data,
              horario = COALESCE(v_novo_horario, horario),
              updated_at = now()
          WHERE id = t.sessao_ref AND status = 'agendado'
            AND (data_sessao <> v_nova_data
                 OR COALESCE(horario,'00:00') <> COALESCE(v_novo_horario, horario, '00:00'));
      END IF;

    ELSIF t.dominio = 'entrevista' THEN
      IF v_tipo = 'cancelamento' THEN
        UPDATE entrevistas_fraternas
          SET status = 'cancelada', updated_at = now()
          WHERE id = t.sessao_ref
            AND status NOT IN ('cancelada','remarcada','concluida','realizada');
      ELSE
        v_nova_ts := (v_nova_data::timestamp + COALESCE(v_novo_horario, t.horario_impactado, '08:00'::time));
        UPDATE entrevistas_fraternas
          SET data = v_nova_ts, updated_at = now()
          WHERE id = t.sessao_ref
            AND status NOT IN ('cancelada','remarcada','concluida','realizada')
            AND data <> v_nova_ts;
      END IF;

    ELSE
      IF v_tipo = 'cancelamento' THEN
        UPDATE sessoes_publicas
          SET status = 'cancelado', updated_at = now()
          WHERE id = t.sessao_ref AND status <> 'cancelado';
      ELSE
        UPDATE sessoes_publicas
          SET data_sessao = v_nova_data,
              horario_inicio = COALESCE(v_novo_horario, horario_inicio),
              updated_at = now()
          WHERE id = t.sessao_ref AND status <> 'cancelado'
            AND (data_sessao <> v_nova_data
                 OR COALESCE(horario_inicio,'00:00') <> COALESCE(v_novo_horario, horario_inicio, '00:00'));
      END IF;
    END IF;

    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'nome', t.nome,
      'tratamento', t.tratamento,
      'data', t.data_impactada,
      'horario', t.horario_impactado,
      'excecao_id', p_excecao_id,
      'motivo_origem', 'excecao_operacional',
      'evento_tipo', v_tipo,
      'compromisso_id', t.compromisso_id,
      'data_impactada', t.data_impactada
    ));
    IF v_tipo = 'remarcacao' THEN
      v_payload := v_payload
        || jsonb_strip_nulls(jsonb_build_object(
             'data_anterior', t.data_impactada,
             'nova_data', v_nova_data,
             'novo_horario', v_novo_horario));
    END IF;

    v_dedupe := v_event::text || ':' || t.compromisso_id::text || ':' || p_excecao_id::text;

    IF t.assistido_id IS NOT NULL THEN
      PERFORM fn_enqueue_notificacao(v_event, t.assistido_id, v_template, v_payload, now(), v_dedupe);
    ELSIF t.telefone IS NOT NULL THEN
      INSERT INTO notificacoes_fila (
        evento_origem, assistido_id, telefone_normalizado, canal,
        template_codigo, payload_json, status, scheduled_at, dedupe_key
      ) VALUES (
        v_event, NULL, t.telefone, 'whatsapp',
        v_template, v_payload, 'pendente', now(), v_dedupe
      ) ON CONFLICT (dedupe_key) DO NOTHING;
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO notificacoes_log (fila_id, direcao, status, erro)
    SELECT f.id, 'saida', 'enfileirado', 'excecao_operacional'
    FROM notificacoes_fila f
    WHERE f.dedupe_key = v_dedupe
      AND NOT EXISTS (
        SELECT 1 FROM notificacoes_log l
        WHERE l.fila_id = f.id AND l.status = 'enfileirado'
      );

    v_count := v_count + 1;
  END LOOP;

  PERFORM set_config('app.excecao_ctx', '', true);

  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (auth.uid(), 'excecoes_operacionais', 'PROCESSAR_NOTIFICACAO', p_excecao_id,
          jsonb_build_object(
            'evento_tipo', v_tipo,
            'alvos', v_count,
            'fallback_por_nome', v_fallback,
            'tipo_excecao', e.tipo));

  RETURN jsonb_build_object(
    'evento_tipo', v_tipo,
    'alvos', v_count,
    'fallback_por_nome', v_fallback);
END $function$;

-- 3) Reconciliação (cron) também respeita o interruptor
CREATE OR REPLACE FUNCTION public.fn_reconciliar_excecoes_notificacoes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_total int := 0;
BEGIN
  IF lower(coalesce((SELECT valor FROM regras_operacionais WHERE chave = 'excecao_notificacao_ativa'), 'true')) <> 'true' THEN
    RETURN jsonb_build_object('contido', 'rollout_pausado', 'processadas', 0);
  END IF;

  FOR r IN
    SELECT id FROM excecoes_operacionais
    WHERE ativo = true
      AND status IN ('cancelado', 'remarcado')
      AND COALESCE(nova_data, data_excecao) >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)
  LOOP
    PERFORM fn_processar_excecao_notificacoes(r.id);
    v_total := v_total + 1;
  END LOOP;
  RETURN jsonb_build_object('processadas', v_total);
END $function$;

-- 4) Painel de monitoramento do rollout (somente leitura)
CREATE OR REPLACE FUNCTION public.fn_monitor_excecao_notificacoes(p_desde timestamptz DEFAULT (now() - interval '14 days'))
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'rollout_ativo', lower(coalesce((SELECT valor FROM regras_operacionais WHERE chave='excecao_notificacao_ativa'),'true')) = 'true',
    'desde', p_desde,
    'excecoes_processadas', (
      SELECT count(*) FROM audit_logs
      WHERE tabela='excecoes_operacionais' AND acao='PROCESSAR_NOTIFICACAO' AND created_at >= p_desde),
    'cancelamentos', (
      SELECT count(*) FROM audit_logs
      WHERE tabela='excecoes_operacionais' AND acao='PROCESSAR_NOTIFICACAO'
        AND created_at >= p_desde AND dados_novos->>'evento_tipo'='cancelamento'),
    'remarcacoes', (
      SELECT count(*) FROM audit_logs
      WHERE tabela='excecoes_operacionais' AND acao='PROCESSAR_NOTIFICACAO'
        AND created_at >= p_desde AND dados_novos->>'evento_tipo'='remarcacao'),
    'fila_por_status', (
      SELECT coalesce(jsonb_object_agg(status, c), '{}'::jsonb) FROM (
        SELECT status, count(*) c FROM notificacoes_fila
        WHERE evento_origem::text LIKE '%excecao%' AND created_at >= p_desde
        GROUP BY status) s),
    'fila_por_evento', (
      SELECT coalesce(jsonb_object_agg(evento_origem, c), '{}'::jsonb) FROM (
        SELECT evento_origem::text evento_origem, count(*) c FROM notificacoes_fila
        WHERE evento_origem::text LIKE '%excecao%' AND created_at >= p_desde
        GROUP BY evento_origem) e),
    'fallback_por_nome', (
      SELECT coalesce(sum((dados_novos->>'fallback_por_nome')::int),0) FROM audit_logs
      WHERE tabela='excecoes_operacionais' AND acao='PROCESSAR_NOTIFICACAO' AND created_at >= p_desde),
    'publico_com_alvo', (
      SELECT count(DISTINCT (dados_novos->>'tipo_excecao')) FROM audit_logs
      WHERE tabela='excecoes_operacionais' AND acao='PROCESSAR_NOTIFICACAO'
        AND created_at >= p_desde AND dados_novos->>'tipo_excecao'='publico'
        AND (dados_novos->>'alvos')::int > 0),
    'dedupe_duplicados', (
      SELECT count(*) FROM (
        SELECT dedupe_key FROM notificacoes_fila
        WHERE evento_origem::text LIKE '%excecao%' AND created_at >= p_desde
        GROUP BY dedupe_key HAVING count(*) > 1) d)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.fn_monitor_excecao_notificacoes(timestamptz) TO authenticated, service_role;
