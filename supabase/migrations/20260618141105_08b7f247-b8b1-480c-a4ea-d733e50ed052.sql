CREATE OR REPLACE FUNCTION public.painel_conversas(
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_identificado boolean DEFAULT NULL,
  p_handoff boolean DEFAULT NULL,
  p_resolucao_ia boolean DEFAULT NULL,
  p_atendente uuid DEFAULT NULL,
  p_busca text DEFAULT NULL,
  p_pendente boolean DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := has_role(auth.uid(), 'admin');
  v_is_coord boolean := has_role(auth.uid(), 'coordenador_de_tratamento');
  v_start timestamptz := CASE WHEN p_inicio IS NULL THEN NULL ELSE p_inicio::timestamp END;
  v_end timestamptz := CASE WHEN p_fim IS NULL THEN NULL ELSE (p_fim::timestamp + interval '1 day' - interval '1 second') END;
  v_rows jsonb;
  v_total integer;
BEGIN
  IF NOT (v_is_admin OR v_is_coord) THEN
    RETURN jsonb_build_object('autorizado', false, 'rows', '[]'::jsonb, 'total', 0);
  END IF;

  CREATE TEMP TABLE _conv ON COMMIT DROP AS
  WITH base AS (
    SELECT
      c.id, c.telefone, c.assistido_id, c.status_conversa::text AS status_conversa,
      c.em_handoff, c.atendente_responsavel, c.ultimo_contato_em, c.ultima_mensagem,
      a.nome AS assistido_nome,
      (c.assistido_id IS NOT NULL) AS identificado
    FROM whatsapp_conversas c
    LEFT JOIN assistidos a ON a.id = c.assistido_id
  ),
  msgs AS (
    SELECT b.id AS conversa_id,
      COUNT(l.*)::int AS total_mensagens,
      (ARRAY_AGG(
        CASE WHEN l.direcao = 'entrada' THEN 'assistido'
             WHEN l.payload_enviado->>'autor' = 'humano' THEN 'humano'
             WHEN l.payload_enviado->>'autor' = 'sistema' THEN 'sistema'
             ELSE 'ia' END
        ORDER BY l.created_at DESC
      ))[1] AS ultimo_autor,
      MAX(CASE WHEN l.direcao = 'entrada' THEN COALESCE(NULLIF(l.payload_recebido->>'intencao',''), NULL) END) AS intencao,
      bool_or(l.direcao = 'saida' AND COALESCE(l.payload_enviado->>'autor','ia') = 'ia') AS respondida_ia
    FROM base b
    JOIN notificacoes_log l
      ON (l.payload_recebido->>'telefone' = b.telefone OR l.payload_enviado->>'telefone' = b.telefone)
    GROUP BY b.id
  ),
  ho AS (
    SELECT DISTINCT ON (h.conversa_id)
      h.conversa_id, h.motivo, h.origem, h.status::text AS handoff_status, h.atendente_id,
      h.opened_at, h.closed_at, h.classificado_por_ia
    FROM whatsapp_handoffs h
    ORDER BY h.conversa_id, h.opened_at DESC
  )
  SELECT
    b.*,
    COALESCE(m.total_mensagens, 0) AS total_mensagens,
    m.ultimo_autor,
    m.intencao,
    COALESCE(m.respondida_ia, false) AS respondida_ia,
    ho.motivo AS handoff_motivo,
    ho.origem AS handoff_origem,
    ho.handoff_status,
    ho.atendente_id AS handoff_atendente_id,
    (ho.conversa_id IS NOT NULL) AS tem_handoff,
    COALESCE(ap.nome_completo, hp.nome_completo) AS atendente_nome
  FROM base b
  LEFT JOIN msgs m ON m.conversa_id = b.id
  LEFT JOIN ho ON ho.conversa_id = b.id
  LEFT JOIN profiles ap ON ap.user_id = b.atendente_responsavel
  LEFT JOIN profiles hp ON hp.user_id = ho.atendente_id
  WHERE (v_start IS NULL OR b.ultimo_contato_em >= v_start)
    AND (v_end IS NULL OR b.ultimo_contato_em <= v_end)
    AND (p_status IS NULL OR b.status_conversa = p_status)
    AND (p_identificado IS NULL OR b.identificado = p_identificado)
    AND (p_atendente IS NULL OR b.atendente_responsavel = p_atendente OR ho.atendente_id = p_atendente)
    AND (p_busca IS NULL OR b.telefone ILIKE '%'||p_busca||'%'
         OR COALESCE(b.assistido_nome,'') ILIKE '%'||p_busca||'%');

  SELECT COUNT(*) INTO v_total FROM _conv
  WHERE (p_handoff IS NULL OR tem_handoff = p_handoff)
    AND (p_resolucao_ia IS NULL OR respondida_ia = p_resolucao_ia)
    AND (p_pendente IS NULL OR (p_pendente = true AND tem_handoff AND COALESCE(handoff_status,'') <> 'fechado')
         OR (p_pendente = false));

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'ultimo_contato_em' DESC NULLS LAST), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
      'id', id,
      'telefone', telefone,
      'assistido_id', assistido_id,
      'assistido_nome', assistido_nome,
      'identificado', identificado,
      'status_conversa', status_conversa,
      'em_handoff', em_handoff,
      'ultimo_contato_em', ultimo_contato_em,
      'ultima_mensagem', ultima_mensagem,
      'total_mensagens', total_mensagens,
      'ultimo_autor', ultimo_autor,
      'intencao', intencao,
      'respondida_ia', respondida_ia,
      'handoff_motivo', handoff_motivo,
      'handoff_origem', handoff_origem,
      'handoff_status', handoff_status,
      'handoff_atendente_id', handoff_atendente_id,
      'tem_handoff', tem_handoff,
      'atendente_nome', atendente_nome,
      'canal', 'whatsapp'
    ) AS r
    FROM _conv
    WHERE (p_handoff IS NULL OR tem_handoff = p_handoff)
      AND (p_resolucao_ia IS NULL OR respondida_ia = p_resolucao_ia)
      AND (p_pendente IS NULL OR (p_pendente = true AND tem_handoff AND COALESCE(handoff_status,'') <> 'fechado')
           OR (p_pendente = false))
    ORDER BY ultimo_contato_em DESC NULLS LAST
    LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  ) s;

  RETURN jsonb_build_object('autorizado', true, 'total', v_total, 'rows', v_rows);
END;
$function$;