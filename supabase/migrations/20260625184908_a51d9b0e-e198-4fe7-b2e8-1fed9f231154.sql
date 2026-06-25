CREATE OR REPLACE FUNCTION public.fn_observabilidade_operacional(p_janela text DEFAULT '7d')
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_from timestamptz;
  v_lembretes text[] := ARRAY['sessao_lembrete','entrevista_lembrete'];
  v_snapshot jsonb;
  v_historico jsonb;
BEGIN
  -- INV-SEG-001 / INV-ARQ-004: autorização no backend (V1: admin, master, coordenador)
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'administrador_master')
    OR public.has_role(auth.uid(), 'coordenador_de_tratamento')
  ) THEN
    RAISE EXCEPTION 'permissao_negada'
      USING ERRCODE = '42501';
  END IF;

  -- Janela temporal do histórico (snapshot ignora isto, é sempre "agora")
  v_from := CASE p_janela
    WHEN '24h' THEN v_now - interval '24 hours'
    WHEN '7d'  THEN v_now - interval '7 days'
    WHEN '30d' THEN v_now - interval '30 days'
    ELSE NULL
  END;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'janela_invalida'
      USING ERRCODE = '22023', HINT = 'Use 24h, 7d ou 30d';
  END IF;

  -- =========================================================
  -- SNAPSHOT ATUAL (estado "agora")
  -- =========================================================
  v_snapshot := jsonb_build_object(
    -- pendências por status (fila inteira agregada por status)
    'pendencias_por_status', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', status, 'qtd', qtd) ORDER BY status)
      FROM (
        SELECT status::text AS status, count(*) AS qtd
        FROM notificacoes_fila
        GROUP BY status
      ) s
    ), '[]'::jsonb),

    -- aguardando janela/limite diário + demais diagnósticos de pendência (fonte canônica L-02)
    'aguardando_janela_limite', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('motivo_codigo', motivo, 'qtd', qtd) ORDER BY motivo)
      FROM (
        SELECT motivo, count(*) AS qtd
        FROM public.fn_fila_diagnostico_pendentes()
        GROUP BY motivo
      ) d
    ), '[]'::jsonb),

    -- avisos de ausência abertos / em tratamento (estado atual)
    'avisos_ausencia', jsonb_build_object(
      'abertos', (SELECT count(*) FROM avisos_ausencia WHERE status = 'aberto'),
      'em_tratamento', (SELECT count(*) FROM avisos_ausencia WHERE status = 'em_tratamento')
    ),

    -- anomalias de lembrete por vínculo (INV-FILA-002: >1 lembrete ativo por vínculo)
    'anomalias_lembrete_por_vinculo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'assistido_id', assistido_id,
               'evento', evento_origem,
               'qtd', qtd) ORDER BY qtd DESC)
      FROM (
        SELECT assistido_id, evento_origem::text AS evento_origem, count(*) AS qtd
        FROM notificacoes_fila
        WHERE status IN ('pendente','agendado')
          AND evento_origem::text = ANY(v_lembretes)
          AND assistido_id IS NOT NULL
        GROUP BY assistido_id, evento_origem
        HAVING count(*) > 1
      ) a
    ), '[]'::jsonb),

    -- inconsistências agenda × fila (item ativo não corresponde mais a compromisso válido)
    'inconsistencias_agenda_fila', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'fila_id', id,
               'motivo_codigo', motivo) ORDER BY motivo)
      FROM (
        SELECT f.id, public.fn_fila_motivo_inelegivel(f.id) AS motivo
        FROM notificacoes_fila f
        WHERE f.status IN ('pendente','agendado')
      ) i
      WHERE i.motivo IS NOT NULL
    ), '[]'::jsonb)
  );

  -- =========================================================
  -- HISTÓRICO POR PERÍODO (o que ACONTECEU na janela; fonte temporal de evento)
  -- =========================================================
  v_historico := jsonb_build_object(
    -- falhas por motivo: evento de falha no período (log temporal)
    'falhas_por_motivo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('motivo_codigo', motivo, 'qtd', qtd) ORDER BY qtd DESC)
      FROM (
        SELECT COALESCE(NULLIF(erro, ''), 'desconhecido') AS motivo, count(*) AS qtd
        FROM notificacoes_log
        WHERE direcao = 'saida'
          AND status = 'falha'
          AND created_at >= v_from AND created_at <= v_now
        GROUP BY 1
      ) f
    ), '[]'::jsonb),

    -- saneados por motivo: evento de saneamento/cancelamento no período (log temporal)
    'saneados_por_motivo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('motivo_codigo', motivo, 'qtd', qtd) ORDER BY qtd DESC)
      FROM (
        SELECT COALESCE(NULLIF(erro, ''), 'desconhecido') AS motivo, count(*) AS qtd
        FROM notificacoes_log
        WHERE direcao = 'saida'
          AND status = 'cancelado'
          AND created_at >= v_from AND created_at <= v_now
        GROUP BY 1
      ) s
    ), '[]'::jsonb),

    -- distribuição por origem: itens CRIADOS no período
    'distribuicao_por_origem', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('origem', origem, 'qtd', qtd) ORDER BY origem)
      FROM (
        SELECT
          CASE
            WHEN evento_origem::text = 'mensagem_manual' THEN 'manual'
            WHEN evento_origem::text LIKE '%_por_excecao' THEN 'excecao'
            ELSE 'automatico'
          END AS origem,
          count(*) AS qtd
        FROM notificacoes_fila
        WHERE created_at >= v_from AND created_at <= v_now
        GROUP BY 1
      ) o
    ), '[]'::jsonb)
  );

  RETURN jsonb_build_object(
    'schema_version', 1,
    'generated_at', v_now,
    'snapshot_reference_time', v_now,
    'historical_window', jsonb_build_object(
      'code', p_janela,
      'from', v_from,
      'to', v_now
    ),
    'snapshot', v_snapshot,
    'historico', v_historico
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_observabilidade_operacional(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_observabilidade_operacional(text) TO authenticated;