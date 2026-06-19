CREATE OR REPLACE FUNCTION public.metricas_ia_whatsapp(p_inicio timestamptz, p_fim timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recebidas int;
  v_respostas_ia int;
  v_conversas int;
  v_sem_fallback int;
  v_complexo int;
  v_hibrido int;
  v_hibrido_conf numeric;
  v_usou_llm int;
  v_pessoais int;
  v_pessoais_nao_ident int;
  v_handoffs int;
  v_handoffs_ia int;
  v_top_intents jsonb;
  v_top_fallback jsonb;
  v_top_complexo jsonb;
  v_top_handoff_motivos jsonb;
  v_handoff_status jsonb;
  v_escopo jsonb;
  v_top_ambiguidades jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem consultar as métricas da IA.';
  END IF;

  -- ===== Entradas (mensagens recebidas reais, exclui logs de falha fatal) =====
  WITH ent AS (
    SELECT
      nl.payload_recebido AS p,
      nl.payload_recebido->>'telefone' AS telefone,
      nl.payload_recebido->>'texto'    AS texto,
      nl.payload_recebido->>'intencao' AS intencao,
      nl.payload_recebido->>'escopo'   AS escopo,
      (nl.payload_recebido->>'fallback_motivo')        AS fallback_motivo,
      (nl.payload_recebido->>'assistido_identificado') AS ident,
      (nl.payload_recebido->>'classificador_hibrido')  AS hibrido,
      NULLIF(nl.payload_recebido->>'confianca_classificacao','')::numeric AS confianca
    FROM notificacoes_log nl
    WHERE nl.direcao = 'entrada'
      AND nl.created_at >= p_inicio AND nl.created_at <= p_fim
      AND nl.payload_recebido ? 'texto'
  )
  SELECT
    COUNT(*)::int,
    COUNT(DISTINCT telefone)::int,
    COUNT(*) FILTER (WHERE fallback_motivo IS NULL)::int,
    COUNT(*) FILTER (WHERE intencao = 'complexo')::int,
    COUNT(*) FILTER (WHERE hibrido = 'true')::int,
    ROUND(AVG(confianca) FILTER (WHERE hibrido = 'true'), 3),
    COUNT(*) FILTER (WHERE escopo = 'pessoal')::int,
    COUNT(*) FILTER (WHERE escopo = 'pessoal' AND ident = 'false')::int
  INTO v_recebidas, v_conversas, v_sem_fallback, v_complexo, v_hibrido, v_hibrido_conf, v_pessoais, v_pessoais_nao_ident
  FROM ent;

  -- Top intents
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_top_intents FROM (
    SELECT jsonb_build_object('intencao', COALESCE(intencao,'(sem)'), 'total', COUNT(*)::int) AS r
    FROM (
      SELECT nl.payload_recebido->>'intencao' AS intencao
      FROM notificacoes_log nl
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND nl.payload_recebido ? 'texto'
    ) x GROUP BY intencao ORDER BY COUNT(*) DESC LIMIT 10
  ) s;

  -- Top fallback motivos
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_top_fallback FROM (
    SELECT jsonb_build_object('motivo', motivo, 'total', COUNT(*)::int) AS r
    FROM (
      SELECT nl.payload_recebido->>'fallback_motivo' AS motivo
      FROM notificacoes_log nl
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND nl.payload_recebido->>'fallback_motivo' IS NOT NULL
    ) x GROUP BY motivo ORDER BY COUNT(*) DESC LIMIT 10
  ) s;

  -- Top mensagens complexo
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_top_complexo FROM (
    SELECT jsonb_build_object('texto', LEFT(texto, 120), 'total', COUNT(*)::int) AS r
    FROM (
      SELECT nl.payload_recebido->>'texto' AS texto
      FROM notificacoes_log nl
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND nl.payload_recebido->>'intencao' = 'complexo'
        AND COALESCE(nl.payload_recebido->>'texto','') <> ''
    ) x GROUP BY texto ORDER BY COUNT(*) DESC LIMIT 15
  ) s;

  -- Escopo distribution
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_escopo FROM (
    SELECT jsonb_build_object('escopo', COALESCE(escopo,'(sem)'), 'total', COUNT(*)::int) AS r
    FROM (
      SELECT nl.payload_recebido->>'escopo' AS escopo
      FROM notificacoes_log nl
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND nl.payload_recebido ? 'texto'
    ) x GROUP BY escopo
  ) s;

  -- Top ambiguidades/erros: mensagens que caíram em complexo OU geraram fallback (com classificação)
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_top_ambiguidades FROM (
    SELECT jsonb_build_object(
      'texto', LEFT(texto, 120),
      'total', COUNT(*)::int,
      'intencao', MAX(intencao),
      'escopo', MAX(escopo),
      'fallback_motivo', MAX(fallback_motivo),
      'hibrido_baixa_conf', BOOL_OR(hibrido='true' AND confianca IS NOT NULL AND confianca < 0.6)
    ) AS r
    FROM (
      SELECT
        nl.payload_recebido->>'texto' AS texto,
        nl.payload_recebido->>'intencao' AS intencao,
        nl.payload_recebido->>'escopo' AS escopo,
        nl.payload_recebido->>'fallback_motivo' AS fallback_motivo,
        nl.payload_recebido->>'classificador_hibrido' AS hibrido,
        NULLIF(nl.payload_recebido->>'confianca_classificacao','')::numeric AS confianca
      FROM notificacoes_log nl
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND COALESCE(nl.payload_recebido->>'texto','') <> ''
        AND (
          nl.payload_recebido->>'intencao' = 'complexo'
          OR nl.payload_recebido->>'fallback_motivo' IS NOT NULL
          OR (nl.payload_recebido->>'classificador_hibrido' = 'true'
              AND NULLIF(nl.payload_recebido->>'confianca_classificacao','')::numeric < 0.6)
        )
    ) x GROUP BY texto ORDER BY COUNT(*) DESC LIMIT 20
  ) s;

  -- Respostas da IA + uso de LLM (saídas)
  SELECT
    COUNT(*) FILTER (WHERE nl.payload_enviado->>'autor' = 'ia')::int,
    COUNT(*) FILTER (WHERE nl.payload_enviado->>'usou_llm' = 'true')::int
  INTO v_respostas_ia, v_usou_llm
  FROM notificacoes_log nl
  WHERE nl.direcao='saida' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim;

  -- Handoffs
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE classificado_por_ia)::int
  INTO v_handoffs, v_handoffs_ia
  FROM whatsapp_handoffs
  WHERE created_at>=p_inicio AND created_at<=p_fim;

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_top_handoff_motivos FROM (
    SELECT jsonb_build_object('motivo', COALESCE(motivo,'(sem)'), 'total', COUNT(*)::int) AS r
    FROM whatsapp_handoffs
    WHERE created_at>=p_inicio AND created_at<=p_fim
    GROUP BY motivo ORDER BY COUNT(*) DESC LIMIT 10
  ) s;

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_handoff_status FROM (
    SELECT jsonb_build_object('status', status::text, 'total', COUNT(*)::int) AS r
    FROM whatsapp_handoffs
    WHERE created_at>=p_inicio AND created_at<=p_fim
    GROUP BY status
  ) s;

  RETURN jsonb_build_object(
    'autorizado', true,
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'volume', jsonb_build_object(
      'mensagens_recebidas', COALESCE(v_recebidas,0),
      'respostas_ia', COALESCE(v_respostas_ia,0),
      'conversas', COALESCE(v_conversas,0)
    ),
    'handoff', jsonb_build_object(
      'total', COALESCE(v_handoffs,0),
      'pct_sobre_mensagens', CASE WHEN COALESCE(v_recebidas,0)>0 THEN ROUND(v_handoffs::numeric/v_recebidas*100,1) ELSE 0 END,
      'classificado_por_ia', COALESCE(v_handoffs_ia,0),
      'top_motivos', v_top_handoff_motivos,
      'por_status', v_handoff_status
    ),
    'classificacao', jsonb_build_object(
      'top_intents', v_top_intents,
      'pct_sem_fallback', CASE WHEN COALESCE(v_recebidas,0)>0 THEN ROUND(v_sem_fallback::numeric/v_recebidas*100,1) ELSE 0 END,
      'top_fallback', v_top_fallback,
      'top_complexo', v_top_complexo,
      'total_complexo', COALESCE(v_complexo,0)
    ),
    'hibrido', jsonb_build_object(
      'total_turnos', COALESCE(v_hibrido,0),
      'pct_sobre_total', CASE WHEN COALESCE(v_recebidas,0)>0 THEN ROUND(v_hibrido::numeric/v_recebidas*100,1) ELSE 0 END,
      'confianca_media', COALESCE(v_hibrido_conf,0),
      'respostas_com_llm', COALESCE(v_usou_llm,0)
    ),
    'escopo', jsonb_build_object(
      'distribuicao', v_escopo,
      'pessoais', COALESCE(v_pessoais,0),
      'pessoais_nao_identificados', COALESCE(v_pessoais_nao_ident,0),
      'pct_pessoais_nao_ident', CASE WHEN COALESCE(v_pessoais,0)>0 THEN ROUND(v_pessoais_nao_ident::numeric/v_pessoais*100,1) ELSE 0 END
    ),
    'ambiguidades', v_top_ambiguidades
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.metricas_ia_whatsapp(timestamptz, timestamptz) TO authenticated;