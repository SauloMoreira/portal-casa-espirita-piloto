CREATE OR REPLACE FUNCTION public.relatorio_carga_tarefeiro(p_data_inicio date, p_data_fim date, p_tratamento_id uuid DEFAULT NULL::uuid, p_tarefeiro_id uuid DEFAULT NULL::uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := has_role(auth.uid(), 'admin');
  v_is_taref boolean := has_role(auth.uid(), 'tarefeiro');
  v_size integer := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_size;
  v_registros integer;
  v_totais jsonb;
  v_rows jsonb;
BEGIN
  CREATE TEMP TABLE _tipos ON COMMIT DROP AS
  SELECT tt.id, tt.nome, tt.tarefeiro_id
  FROM tipos_tratamento tt
  WHERE tt.tarefeiro_id IS NOT NULL
    AND (p_tratamento_id IS NULL OR tt.id = p_tratamento_id)
    AND (p_tarefeiro_id IS NULL OR tt.tarefeiro_id = p_tarefeiro_id)
    AND (v_is_admin OR NOT v_is_taref OR tt.tarefeiro_id = auth.uid());

  CREATE TEMP TABLE _carga ON COMMIT DROP AS
  WITH sess AS (
    -- Carga combinada: modelo legado (agenda_tratamentos_assistido) +
    -- novo modelo (plano_tratamento_sessoes), com deduplicação.
    -- Uma linha legada NÃO é contada quando (a) está marcada como
    -- 'substituida_plano' ou (b) já foi materializada por uma etapa do
    -- plano (referência via plano_tratamento_sessoes.agenda_sessao_id).
    -- Nesses casos a sessão é contada apenas pelo plano.
    SELECT t.tarefeiro_id,
      COUNT(*) AS sessoes,
      COUNT(DISTINCT u.assistido_id) AS assistidos
    FROM (
      -- Legado não substituído pelo plano
      SELECT ag.tratamento_id, ag.assistido_id
      FROM agenda_tratamentos_assistido ag
      WHERE ag.data_sessao >= p_data_inicio AND ag.data_sessao <= p_data_fim
        AND ag.status <> 'substituida_plano'
        AND NOT EXISTS (
          SELECT 1 FROM plano_tratamento_sessoes ps
          WHERE ps.agenda_sessao_id = ag.id
        )
      UNION ALL
      -- Novo modelo (plano de tratamento)
      SELECT ps.tipo_tratamento_id AS tratamento_id, ps.assistido_id
      FROM plano_tratamento_sessoes ps
      WHERE ps.data_prevista >= p_data_inicio AND ps.data_prevista <= p_data_fim
    ) u
    JOIN _tipos t ON t.id = u.tratamento_id
    GROUP BY t.tarefeiro_id
  ),
  pres AS (
    SELECT t.tarefeiro_id,
      COUNT(*) FILTER (WHERE pt.status_presenca = 'presente') AS presencas,
      COUNT(*) FILTER (WHERE pt.status_presenca <> 'presente') AS ausencias
    FROM presencas_tratamentos pt
    JOIN assistido_tratamentos at ON at.id = pt.assistido_tratamento_id
    JOIN _tipos t ON t.id = at.tratamento_id
    WHERE pt.data >= p_data_inicio AND pt.data <= p_data_fim
    GROUP BY t.tarefeiro_id
  ),
  vinc AS (
    SELECT t.tarefeiro_id,
      COUNT(*) FILTER (WHERE at.status = 'em_andamento') AS em_andamento,
      COUNT(*) FILTER (WHERE at.status = 'concluido') AS concluidos
    FROM assistido_tratamentos at
    JOIN _tipos t ON t.id = at.tratamento_id
    GROUP BY t.tarefeiro_id
  ),
  trats AS (
    SELECT tarefeiro_id, jsonb_agg(nome ORDER BY nome) AS tratamentos
    FROM _tipos GROUP BY tarefeiro_id
  )
  SELECT
    d.tarefeiro_id,
    COALESCE(p.nome_completo, '—') AS tarefeiro,
    COALESCE(s.assistidos, 0)::int AS total_assistidos,
    COALESCE(s.sessoes, 0)::int AS total_sessoes,
    COALESCE(pr.presencas, 0)::int AS presencas,
    COALESCE(pr.ausencias, 0)::int AS ausencias,
    COALESCE(v.em_andamento, 0)::int AS em_andamento,
    COALESCE(v.concluidos, 0)::int AS concluidos,
    COALESCE(tr.tratamentos, '[]'::jsonb) AS tratamentos
  FROM (SELECT DISTINCT tarefeiro_id FROM _tipos) d
  LEFT JOIN profiles p ON p.user_id = d.tarefeiro_id
  LEFT JOIN sess s ON s.tarefeiro_id = d.tarefeiro_id
  LEFT JOIN pres pr ON pr.tarefeiro_id = d.tarefeiro_id
  LEFT JOIN vinc v ON v.tarefeiro_id = d.tarefeiro_id
  LEFT JOIN trats tr ON tr.tarefeiro_id = d.tarefeiro_id;

  SELECT COUNT(*) INTO v_registros FROM _carga;

  SELECT jsonb_build_object(
    'sessoes', COALESCE(SUM(total_sessoes), 0),
    'assistidos', COALESCE(SUM(total_assistidos), 0),
    'presencas', COALESCE(SUM(presencas), 0),
    'ausencias', COALESCE(SUM(ausencias), 0),
    'em_andamento', COALESCE(SUM(em_andamento), 0),
    'concluidos', COALESCE(SUM(concluidos), 0),
    'maior_carga', (SELECT tarefeiro FROM _carga ORDER BY total_sessoes DESC, tarefeiro ASC LIMIT 1)
  ) INTO v_totais FROM _carga;

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
    SELECT tarefeiro_id, tarefeiro, total_assistidos, total_sessoes, presencas, ausencias, em_andamento, concluidos, tratamentos
    FROM _carga
    ORDER BY tarefeiro ASC
    LIMIT v_size OFFSET v_offset
  ) r;

  RETURN jsonb_build_object(
    'registros', v_registros,
    'totais', v_totais,
    'rows', v_rows
  );
END;
$function$;