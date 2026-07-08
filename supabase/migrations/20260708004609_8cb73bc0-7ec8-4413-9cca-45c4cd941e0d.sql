-- SAAS-05-E4 — RPCs tenant-aware de Relatórios, Dashboards, Observabilidade e Central IA (lote 4).
-- Padrão SAAS-05-E1/E2/E3: novo overload com p_instituicao_id obrigatório,
-- validação (NOT NULL → auth → membership OU platform_admin) e filtro explícito
-- por tenant (join com T-DIR pai). Assinaturas legadas preservadas
-- (backward-compat; cutover em SAAS-05-F). Nenhuma alteração em RLS, policies,
-- NOT NULL, tabelas T-DIR/T-HER, edge functions, dispatcher, WhatsApp, check-in
-- público ou projeto FER original.

-- ============================================================
-- 1) dashboard_admin (agregação: assistidos/palestras T-DIR)
-- ============================================================
CREATE OR REPLACE FUNCTION public.dashboard_admin(
  p_inicio date,
  p_fim date,
  p_instituicao_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_uid, 'admin');
  v_today date := CURRENT_DATE;
  v_start timestamp := p_inicio::timestamp;
  v_end timestamp := (p_fim::timestamp + interval '1 day' - interval '1 second');
  v_ent_recentes jsonb;
  v_trat_por_tipo jsonb;
  v_carga jsonb;
  v_presenca jsonb;
  v_ent_tipo jsonb;
  v_faixa jsonb;
BEGIN
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE='22023';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.is_platform_admin(v_uid)
          OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('autorizado', false);
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);

  CREATE TEMP TABLE _trat ON COMMIT DROP AS
  SELECT at.tratamento_id, tt.nome AS trat_nome, tt.tarefeiro_id
  FROM assistido_tratamentos at
  JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
  JOIN assistidos a ON a.id = at.assistido_id
  WHERE at.status IN ('aguardando_inicio', 'em_andamento')
    AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id);

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_ent_recentes FROM (
    SELECT e.id, e.data, e.status, e.assistido_id, e.entrevistador_id, e.tipo_entrevista,
      COALESCE(a.nome, '—') AS assistido_nome,
      COALESCE(p.nome_completo, '—') AS entrevistador_nome
    FROM entrevistas_fraternas e
    LEFT JOIN assistidos a ON a.id = e.assistido_id
    LEFT JOIN profiles p ON p.user_id = e.entrevistador_id
    WHERE (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    ORDER BY e.data DESC
    LIMIT 5
  ) r;

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_trat_por_tipo FROM (
    SELECT trat_nome AS nome, COUNT(*)::int AS count
    FROM _trat
    GROUP BY tratamento_id, trat_nome
    ORDER BY COUNT(*) DESC
  ) r;

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_carga FROM (
    SELECT COALESCE(p.nome_completo,
             CASE WHEN p.user_id IS NOT NULL THEN 'Sem nome' ELSE LEFT(t.tarefeiro_id::text, 8) END) AS nome,
           COUNT(*)::int AS total
    FROM _trat t
    LEFT JOIN profiles p ON p.user_id = t.tarefeiro_id
    WHERE t.tarefeiro_id IS NOT NULL
    GROUP BY t.tarefeiro_id, p.user_id, p.nome_completo
    ORDER BY COUNT(*) DESC
  ) r;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_presenca FROM (
    SELECT data, presentes, ausentes FROM (
      SELECT data::text AS data,
        COUNT(*) FILTER (WHERE pt.status_presenca = 'presente')::int AS presentes,
        COUNT(*) FILTER (WHERE pt.status_presenca <> 'presente')::int AS ausentes
      FROM presencas_tratamentos pt
      JOIN assistido_tratamentos at ON at.id = pt.assistido_tratamento_id
      JOIN assistidos a ON a.id = at.assistido_id
      WHERE pt.data >= p_inicio AND pt.data <= p_fim
        AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
      GROUP BY data
      ORDER BY data DESC
      LIMIT 15
    ) s
    ORDER BY data ASC
  ) x;

  SELECT jsonb_build_object(
    'regulares', COUNT(*) FILTER (WHERE e.tipo_entrevista IS DISTINCT FROM 'livre')::int,
    'livres', COUNT(*) FILTER (WHERE e.tipo_entrevista = 'livre')::int,
    'realizadas', COUNT(*) FILTER (WHERE e.status = 'realizada')::int,
    'total', COUNT(*)::int
  ) INTO v_ent_tipo
  FROM entrevistas_fraternas e
  JOIN assistidos a ON a.id = e.assistido_id
  WHERE e.data >= v_start AND e.data <= v_end
    AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id);

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_faixa FROM (
    SELECT grp AS name, cnt AS value FROM (
      SELECT grp, COUNT(*)::int AS cnt,
        CASE grp
          WHEN 'Até 17' THEN 1 WHEN '18–24' THEN 2 WHEN '25–34' THEN 3
          WHEN '35–44' THEN 4 WHEN '45–59' THEN 5 WHEN '60+' THEN 6 ELSE 7
        END AS ord
      FROM (
        SELECT CASE
          WHEN a.data_nascimento IS NULL THEN 'Não informado'
          WHEN date_part('year', age(a.data_nascimento)) BETWEEN 0 AND 17 THEN 'Até 17'
          WHEN date_part('year', age(a.data_nascimento)) BETWEEN 18 AND 24 THEN '18–24'
          WHEN date_part('year', age(a.data_nascimento)) BETWEEN 25 AND 34 THEN '25–34'
          WHEN date_part('year', age(a.data_nascimento)) BETWEEN 35 AND 44 THEN '35–44'
          WHEN date_part('year', age(a.data_nascimento)) BETWEEN 45 AND 59 THEN '45–59'
          WHEN date_part('year', age(a.data_nascimento)) >= 60 THEN '60+'
          ELSE 'Não informado'
        END AS grp
        FROM assistidos a
        WHERE a.deleted_at IS NULL
          AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
      ) g
      GROUP BY grp
    ) s
    WHERE cnt > 0
    ORDER BY ord
  ) r;

  RETURN jsonb_build_object(
    'autorizado', true,
    'assistidos_total', (SELECT COUNT(*)::int FROM assistidos a
                         WHERE a.deleted_at IS NULL
                           AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)),
    'trat_ativos', (SELECT COUNT(*)::int FROM assistido_tratamentos at
                    JOIN assistidos a ON a.id = at.assistido_id
                    WHERE at.status IN ('aguardando_inicio', 'em_andamento')
                      AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)),
    'trat_concluidos', (SELECT COUNT(*)::int FROM assistido_tratamentos at
                        JOIN assistidos a ON a.id = at.assistido_id
                        WHERE at.status = 'concluido'
                          AND at.updated_at >= v_start AND at.updated_at <= v_end
                          AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)),
    'ent_agendadas', (SELECT COUNT(*)::int FROM entrevistas_fraternas e
                      JOIN assistidos a ON a.id = e.assistido_id
                      WHERE e.status = 'agendada'
                        AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)),
    'presencas_hoje', (SELECT COUNT(*)::int FROM presencas_tratamentos pt
                       JOIN assistido_tratamentos at ON at.id = pt.assistido_tratamento_id
                       JOIN assistidos a ON a.id = at.assistido_id
                       WHERE pt.data = v_today
                         AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)),
    'lista_espera', (SELECT COUNT(*)::int FROM assistido_tratamentos at
                     JOIN assistidos a ON a.id = at.assistido_id
                     WHERE at.status = 'aguardando_liberacao'
                       AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)),
    'aguardando_agend', (SELECT COUNT(*)::int FROM assistido_tratamentos at
                         JOIN assistidos a ON a.id = at.assistido_id
                         WHERE at.status = 'aguardando_agendamento'
                           AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)),
    'faltas_mes', (SELECT COUNT(*)::int FROM presencas_tratamentos pt
                   JOIN assistido_tratamentos at ON at.id = pt.assistido_tratamento_id
                   JOIN assistidos a ON a.id = at.assistido_id
                   WHERE pt.status_presenca = 'ausente'
                     AND pt.data >= p_inicio AND pt.data <= p_fim
                     AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)),
    'publico_palestras', (SELECT COUNT(*)::int FROM presencas_palestras pp
                          JOIN palestras pl ON pl.id = pp.palestra_id
                          WHERE pp.presente = true
                            AND (pl.instituicao_id IS NULL OR pl.instituicao_id = p_instituicao_id)),
    'ent_recentes', v_ent_recentes,
    'trat_por_tipo', v_trat_por_tipo,
    'carga_tarefeiros', v_carga,
    'presenca_pontos', v_presenca,
    'entrevistas_por_tipo', v_ent_tipo,
    'faixa_etaria', v_faixa
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.dashboard_admin(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_admin(date, date, uuid) TO authenticated;

-- ============================================================
-- 2) relatorio_tratamentos_concluidos (recurso: assistidos T-DIR)
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_tratamentos_concluidos(
  p_data_inicio date,
  p_data_fim date,
  p_tratamento_id uuid DEFAULT NULL::uuid,
  p_tipo text DEFAULT NULL::text,
  p_tarefeiro_id uuid DEFAULT NULL::uuid,
  p_coordenador_id uuid DEFAULT NULL::uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_instituicao_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_uid, 'admin');
  v_is_coord boolean := public.has_role(v_uid, 'coordenador_de_tratamento');
  v_is_taref boolean := public.has_role(v_uid, 'tarefeiro');
  v_size integer := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_size;
  v_registros integer;
  v_totais jsonb;
  v_rows jsonb;
  v_por_tratamento jsonb;
  v_por_tipo jsonb;
BEGIN
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE='22023';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.is_platform_admin(v_uid)
          OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);

  CREATE TEMP TABLE _tc ON COMMIT DROP AS
  SELECT
    at.id,
    a.nome AS assistido,
    tt.nome AS tratamento,
    COALESCE(NULLIF(tt.tipo, ''), '—') AS tipo,
    at.data_inicio,
    at.updated_at AS data_conclusao,
    at.quantidade_total AS total,
    at.quantidade_realizada AS realizada,
    COALESCE(pt.nome_completo, '—') AS tarefeiro,
    COALESCE(pc.nome_completo, '—') AS coordenador
  FROM assistido_tratamentos at
  JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
  JOIN assistidos a ON a.id = at.assistido_id
  LEFT JOIN profiles pt ON pt.user_id = tt.tarefeiro_id
  LEFT JOIN profiles pc ON pc.user_id = tt.coordenador_responsavel_id
  WHERE at.status = 'concluido'
    AND at.updated_at >= p_data_inicio::timestamp
    AND at.updated_at <= (p_data_fim::timestamp + interval '1 day' - interval '1 second')
    AND (p_tratamento_id IS NULL OR at.tratamento_id = p_tratamento_id)
    AND (p_tipo IS NULL OR tt.tipo = p_tipo)
    AND (p_tarefeiro_id IS NULL OR tt.tarefeiro_id = p_tarefeiro_id)
    AND (p_coordenador_id IS NULL OR tt.coordenador_responsavel_id = p_coordenador_id)
    AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    AND (v_is_admin OR NOT v_is_coord OR tt.coordenador_responsavel_id = v_uid)
    AND (v_is_admin OR NOT v_is_taref OR tt.tarefeiro_id IS NULL OR tt.tarefeiro_id = v_uid);

  SELECT COUNT(*) INTO v_registros FROM _tc;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'assistidos', COUNT(DISTINCT assistido),
    'tipos', COUNT(DISTINCT tipo),
    'sessoes', COALESCE(SUM(realizada), 0)
  ) INTO v_totais FROM _tc;

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
    SELECT id, assistido, tratamento, tipo, data_inicio, data_conclusao, total, realizada, tarefeiro, coordenador
    FROM _tc
    ORDER BY data_conclusao DESC
    LIMIT v_size OFFSET v_offset
  ) r;

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_por_tratamento FROM (
    SELECT tratamento AS nome, COUNT(*) AS count
    FROM _tc GROUP BY tratamento ORDER BY COUNT(*) DESC LIMIT 8
  ) r;

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_por_tipo FROM (
    SELECT tipo AS nome, COUNT(*) AS count
    FROM _tc GROUP BY tipo ORDER BY COUNT(*) DESC
  ) r;

  RETURN jsonb_build_object(
    'registros', v_registros,
    'totais', v_totais,
    'rows', v_rows,
    'por_tratamento', v_por_tratamento,
    'por_tipo', v_por_tipo
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.relatorio_tratamentos_concluidos(date, date, uuid, text, uuid, uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_tratamentos_concluidos(date, date, uuid, text, uuid, uuid, integer, integer, uuid) TO authenticated;

-- ============================================================
-- 3) relatorio_carga_tarefeiro (recurso: assistidos T-DIR via joins)
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_carga_tarefeiro(
  p_data_inicio date,
  p_data_fim date,
  p_tratamento_id uuid DEFAULT NULL::uuid,
  p_tarefeiro_id uuid DEFAULT NULL::uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_instituicao_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_uid, 'admin');
  v_is_taref boolean := public.has_role(v_uid, 'tarefeiro');
  v_size integer := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_size;
  v_registros integer;
  v_totais jsonb;
  v_rows jsonb;
BEGIN
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE='22023';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.is_platform_admin(v_uid)
          OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);

  CREATE TEMP TABLE _tipos ON COMMIT DROP AS
  SELECT tt.id, tt.nome, tt.tarefeiro_id
  FROM tipos_tratamento tt
  WHERE tt.tarefeiro_id IS NOT NULL
    AND (p_tratamento_id IS NULL OR tt.id = p_tratamento_id)
    AND (p_tarefeiro_id IS NULL OR tt.tarefeiro_id = p_tarefeiro_id)
    AND (v_is_admin OR NOT v_is_taref OR tt.tarefeiro_id = v_uid);

  CREATE TEMP TABLE _carga ON COMMIT DROP AS
  WITH sess AS (
    SELECT t.tarefeiro_id,
      COUNT(*) AS sessoes,
      COUNT(DISTINCT ag.assistido_id) AS assistidos
    FROM agenda_tratamentos_assistido ag
    JOIN _tipos t ON t.id = ag.tratamento_id
    JOIN assistidos a ON a.id = ag.assistido_id
    WHERE ag.data_sessao >= p_data_inicio AND ag.data_sessao <= p_data_fim
      AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    GROUP BY t.tarefeiro_id
  ),
  pres AS (
    SELECT t.tarefeiro_id,
      COUNT(*) FILTER (WHERE pt.status_presenca = 'presente') AS presencas,
      COUNT(*) FILTER (WHERE pt.status_presenca <> 'presente') AS ausencias
    FROM presencas_tratamentos pt
    JOIN assistido_tratamentos at ON at.id = pt.assistido_tratamento_id
    JOIN _tipos t ON t.id = at.tratamento_id
    JOIN assistidos a ON a.id = at.assistido_id
    WHERE pt.data >= p_data_inicio AND pt.data <= p_data_fim
      AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    GROUP BY t.tarefeiro_id
  ),
  vinc AS (
    SELECT t.tarefeiro_id,
      COUNT(*) FILTER (WHERE at.status = 'em_andamento') AS em_andamento,
      COUNT(*) FILTER (WHERE at.status = 'concluido') AS concluidos
    FROM assistido_tratamentos at
    JOIN _tipos t ON t.id = at.tratamento_id
    JOIN assistidos a ON a.id = at.assistido_id
    WHERE (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
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
REVOKE EXECUTE ON FUNCTION public.relatorio_carga_tarefeiro(date, date, uuid, uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_carga_tarefeiro(date, date, uuid, uuid, integer, integer, uuid) TO authenticated;

-- ============================================================
-- 4) relatorio_frequencia_presenca (recurso: assistidos T-DIR)
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_frequencia_presenca(
  p_data_inicio date,
  p_data_fim date,
  p_tratamento_id uuid DEFAULT NULL,
  p_assistido_id uuid DEFAULT NULL,
  p_tarefeiro_id uuid DEFAULT NULL,
  p_coordenador_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_instituicao_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_uid, 'admin');
  v_is_coord boolean := public.has_role(v_uid, 'coordenador_de_tratamento');
  v_is_taref boolean := public.has_role(v_uid, 'tarefeiro');
  v_size integer := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_size;
  v_registros integer;
  v_totais jsonb;
  v_rows jsonb;
BEGIN
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE='22023';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.is_platform_admin(v_uid)
          OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);

  CREATE TEMP TABLE _freq ON COMMIT DROP AS
  SELECT
    pt.assistido_tratamento_id AS key,
    a.nome AS nome,
    tt.nome AS tratamento,
    COUNT(*) FILTER (WHERE pt.status_presenca = 'presente') AS presencas,
    COUNT(*) FILTER (WHERE pt.status_presenca <> 'presente') AS ausencias,
    COUNT(*) AS total
  FROM presencas_tratamentos pt
  JOIN assistido_tratamentos at ON at.id = pt.assistido_tratamento_id
  JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
  JOIN assistidos a ON a.id = at.assistido_id
  WHERE pt.data >= p_data_inicio
    AND pt.data <= p_data_fim
    AND (p_tratamento_id IS NULL OR at.tratamento_id = p_tratamento_id)
    AND (p_assistido_id IS NULL OR at.assistido_id = p_assistido_id)
    AND (p_tarefeiro_id IS NULL OR tt.tarefeiro_id = p_tarefeiro_id)
    AND (p_coordenador_id IS NULL OR tt.coordenador_responsavel_id = p_coordenador_id)
    AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    AND (v_is_admin OR NOT v_is_coord OR tt.coordenador_responsavel_id = v_uid)
    AND (v_is_admin OR NOT v_is_taref OR tt.tarefeiro_id IS NULL OR tt.tarefeiro_id = v_uid)
  GROUP BY pt.assistido_tratamento_id, a.nome, tt.nome;

  SELECT COUNT(*) INTO v_registros FROM _freq;

  SELECT jsonb_build_object(
    'total', COALESCE(SUM(total), 0),
    'presencas', COALESCE(SUM(presencas), 0),
    'ausencias', COALESCE(SUM(ausencias), 0)
  ) INTO v_totais FROM _freq;

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
    SELECT
      nome,
      tratamento,
      presencas,
      ausencias,
      total,
      CASE WHEN total > 0 THEN ROUND(presencas::numeric / total * 100) ELSE 0 END AS percentual
    FROM _freq
    ORDER BY nome ASC
    LIMIT v_size OFFSET v_offset
  ) r;

  RETURN jsonb_build_object('registros', v_registros, 'totais', v_totais, 'rows', v_rows);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.relatorio_frequencia_presenca(date, date, uuid, uuid, uuid, uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_frequencia_presenca(date, date, uuid, uuid, uuid, uuid, integer, integer, uuid) TO authenticated;

-- ============================================================
-- 5) relatorio_faltas_periodo (recurso: assistidos T-DIR)
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_faltas_periodo(
  p_data_inicio date,
  p_data_fim date,
  p_tratamento_id uuid DEFAULT NULL,
  p_assistido_id uuid DEFAULT NULL,
  p_tarefeiro_id uuid DEFAULT NULL,
  p_coordenador_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_instituicao_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_uid, 'admin');
  v_is_coord boolean := public.has_role(v_uid, 'coordenador_de_tratamento');
  v_is_taref boolean := public.has_role(v_uid, 'tarefeiro');
  v_size integer := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_size;
  v_registros integer;
  v_totais jsonb;
  v_rows jsonb;
BEGIN
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE='22023';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.is_platform_admin(v_uid)
          OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);

  CREATE TEMP TABLE _faltas ON COMMIT DROP AS
  SELECT
    pt.assistido_tratamento_id AS key,
    a.nome AS assistido,
    tt.nome AS tratamento,
    COUNT(*) FILTER (WHERE pt.status_presenca = 'ausente') AS total_faltas,
    ARRAY(
      SELECT pt2.data::text
      FROM presencas_tratamentos pt2
      WHERE pt2.assistido_tratamento_id = pt.assistido_tratamento_id
        AND pt2.status_presenca = 'ausente'
        AND pt2.data >= p_data_inicio
        AND pt2.data <= p_data_fim
      ORDER BY pt2.data
    ) AS datas,
    COUNT(*) AS total_sessoes
  FROM presencas_tratamentos pt
  JOIN assistido_tratamentos at ON at.id = pt.assistido_tratamento_id
  JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
  JOIN assistidos a ON a.id = at.assistido_id
  WHERE pt.data >= p_data_inicio
    AND pt.data <= p_data_fim
    AND (p_tratamento_id IS NULL OR at.tratamento_id = p_tratamento_id)
    AND (p_assistido_id IS NULL OR at.assistido_id = p_assistido_id)
    AND (p_tarefeiro_id IS NULL OR tt.tarefeiro_id = p_tarefeiro_id)
    AND (p_coordenador_id IS NULL OR tt.coordenador_responsavel_id = p_coordenador_id)
    AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    AND (v_is_admin OR NOT v_is_coord OR tt.coordenador_responsavel_id = v_uid)
    AND (v_is_admin OR NOT v_is_taref OR tt.tarefeiro_id IS NULL OR tt.tarefeiro_id = v_uid)
  GROUP BY pt.assistido_tratamento_id, a.nome, tt.nome
  HAVING COUNT(*) FILTER (WHERE pt.status_presenca = 'ausente') > 0;

  SELECT COUNT(*) INTO v_registros FROM _faltas;

  SELECT jsonb_build_object(
    'total_faltas', COALESCE(SUM(total_faltas), 0),
    'assistidos_com_falta', COALESCE(COUNT(DISTINCT assistido), 0),
    'pct_medio', COALESCE(ROUND(AVG(
      CASE WHEN total_sessoes > 0 THEN total_faltas::numeric / total_sessoes * 100 ELSE 0 END
    )), 0),
    'vinculos_com_falta', v_registros
  ) INTO v_totais FROM _faltas;

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
    SELECT
      assistido,
      tratamento,
      total_faltas,
      datas,
      total_sessoes,
      CASE WHEN total_sessoes > 0 THEN ROUND(total_faltas::numeric / total_sessoes * 100) ELSE 0 END AS percentual
    FROM _faltas
    ORDER BY total_faltas DESC
    LIMIT v_size OFFSET v_offset
  ) r;

  RETURN jsonb_build_object('registros', v_registros, 'totais', v_totais, 'rows', v_rows);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.relatorio_faltas_periodo(date, date, uuid, uuid, uuid, uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_faltas_periodo(date, date, uuid, uuid, uuid, uuid, integer, integer, uuid) TO authenticated;

-- ============================================================
-- 6) fn_observabilidade_operacional (recurso: notificacoes/avisos → assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_observabilidade_operacional(
  p_janela text DEFAULT '7d',
  p_instituicao_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_from timestamptz;
  v_lembretes text[] := ARRAY['sessao_lembrete','entrevista_lembrete'];
  v_snapshot jsonb;
  v_historico jsonb;
BEGIN
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE='22023';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.is_platform_admin(v_uid)
          OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin')
    OR public.has_role(v_uid, 'administrador_master')
    OR public.has_role(v_uid, 'coordenador_de_tratamento')
  ) THEN
    RAISE EXCEPTION 'permissao_negada'
      USING ERRCODE = '42501';
  END IF;

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

  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);

  v_snapshot := jsonb_build_object(
    'pendencias_por_status', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', status, 'qtd', qtd) ORDER BY status)
      FROM (
        SELECT f.status::text AS status, count(*) AS qtd
        FROM notificacoes_fila f
        LEFT JOIN assistidos a ON a.id = f.assistido_id
        WHERE (f.assistido_id IS NULL OR a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
        GROUP BY f.status
      ) s
    ), '[]'::jsonb),

    'aguardando_janela_limite', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('motivo_codigo', motivo, 'qtd', qtd) ORDER BY motivo)
      FROM (
        SELECT motivo, count(*) AS qtd
        FROM public.fn_fila_diagnostico_pendentes() d
        LEFT JOIN notificacoes_fila f ON f.id = d.fila_id
        LEFT JOIN assistidos a ON a.id = f.assistido_id
        WHERE (f.assistido_id IS NULL OR a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
          OR d.fila_id IS NULL
        GROUP BY motivo
      ) d
    ), '[]'::jsonb),

    'avisos_ausencia', jsonb_build_object(
      'abertos', (SELECT count(*) FROM avisos_ausencia av
                  JOIN assistidos a ON a.id = av.assistido_id
                  WHERE av.status = 'aberto'
                    AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)),
      'em_tratamento', (SELECT count(*) FROM avisos_ausencia av
                        JOIN assistidos a ON a.id = av.assistido_id
                        WHERE av.status = 'em_tratamento'
                          AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id))
    ),

    'anomalias_lembrete_por_vinculo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'assistido_id', assistido_id,
               'evento', evento_origem,
               'qtd', qtd) ORDER BY qtd DESC)
      FROM (
        SELECT f.assistido_id, f.evento_origem::text AS evento_origem, count(*) AS qtd
        FROM notificacoes_fila f
        JOIN assistidos a ON a.id = f.assistido_id
        WHERE f.status IN ('pendente','agendado')
          AND f.evento_origem::text = ANY(v_lembretes)
          AND f.assistido_id IS NOT NULL
          AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
        GROUP BY f.assistido_id, f.evento_origem
        HAVING count(*) > 1
      ) a
    ), '[]'::jsonb),

    'inconsistencias_agenda_fila', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'fila_id', id,
               'motivo_codigo', motivo) ORDER BY motivo)
      FROM (
        SELECT f.id, public.fn_fila_motivo_inelegivel(f.id) AS motivo
        FROM notificacoes_fila f
        LEFT JOIN assistidos a ON a.id = f.assistido_id
        WHERE f.status IN ('pendente','agendado')
          AND (f.assistido_id IS NULL OR a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
      ) i
      WHERE i.motivo IS NOT NULL
    ), '[]'::jsonb)
  );

  v_historico := jsonb_build_object(
    'falhas_por_motivo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('motivo_codigo', motivo, 'qtd', qtd) ORDER BY qtd DESC)
      FROM (
        SELECT COALESCE(NULLIF(erro, ''), 'desconhecido') AS motivo, count(*) AS qtd
        FROM notificacoes_log nl
        JOIN notificacoes_fila f ON f.id = nl.fila_id
        JOIN assistidos a ON a.id = f.assistido_id
        WHERE nl.direcao = 'saida'
          AND nl.status = 'falha'
          AND nl.created_at >= v_from AND nl.created_at <= v_now
          AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
        GROUP BY 1
      ) f
    ), '[]'::jsonb),

    'saneados_por_motivo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('motivo_codigo', motivo, 'qtd', qtd) ORDER BY qtd DESC)
      FROM (
        SELECT COALESCE(NULLIF(erro, ''), 'desconhecido') AS motivo, count(*) AS qtd
        FROM notificacoes_log nl
        JOIN notificacoes_fila f ON f.id = nl.fila_id
        JOIN assistidos a ON a.id = f.assistido_id
        WHERE nl.direcao = 'saida'
          AND nl.status = 'cancelado'
          AND nl.created_at >= v_from AND nl.created_at <= v_now
          AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
        GROUP BY 1
      ) s
    ), '[]'::jsonb),

    'distribuicao_por_origem', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('origem', origem, 'qtd', qtd) ORDER BY origem)
      FROM (
        SELECT
          CASE
            WHEN f.evento_origem::text = 'mensagem_manual' THEN 'manual'
            WHEN f.evento_origem::text LIKE '%_por_excecao' THEN 'excecao'
            ELSE 'automatico'
          END AS origem,
          count(*) AS qtd
        FROM notificacoes_fila f
        LEFT JOIN assistidos a ON a.id = f.assistido_id
        WHERE f.created_at >= v_from AND f.created_at <= v_now
          AND (f.assistido_id IS NULL OR a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
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
REVOKE EXECUTE ON FUNCTION public.fn_observabilidade_operacional(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_observabilidade_operacional(text, uuid) TO authenticated;

-- ============================================================
-- 7) metricas_ia_whatsapp (recurso: whatsapp_conversas/notificacoes_fila → assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.metricas_ia_whatsapp(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_instituicao_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_recebidas int;
  v_respostas_ia int;
  v_usou_llm int;
  v_conversas int;
  v_sem_fallback int;
  v_complexo int;
  v_hibrido int;
  v_hibrido_conf numeric;
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
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE='22023';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.is_platform_admin(v_uid)
          OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem consultar as métricas da IA.';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);

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
    LEFT JOIN notificacoes_fila nf ON nf.id = nl.fila_id
    LEFT JOIN whatsapp_conversas wc ON wc.telefone = nl.payload_recebido->>'telefone'
    LEFT JOIN assistidos a1 ON a1.id = nf.assistido_id
    LEFT JOIN assistidos a2 ON a2.id = wc.assistido_id
    WHERE nl.direcao = 'entrada'
      AND nl.created_at >= p_inicio AND nl.created_at <= p_fim
      AND nl.payload_recebido ? 'texto'
      AND (
        (a1.instituicao_id IS NULL OR a1.instituicao_id = p_instituicao_id)
        OR (a2.instituicao_id IS NULL OR a2.instituicao_id = p_instituicao_id)
      )
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

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_top_intents FROM (
    SELECT jsonb_build_object('intencao', COALESCE(intencao,'(sem)'), 'total', COUNT(*)::int) AS r
    FROM (
      SELECT nl.payload_recebido->>'intencao' AS intencao
      FROM notificacoes_log nl
      LEFT JOIN notificacoes_fila nf ON nf.id = nl.fila_id
      LEFT JOIN whatsapp_conversas wc ON wc.telefone = nl.payload_recebido->>'telefone'
      LEFT JOIN assistidos a1 ON a1.id = nf.assistido_id
      LEFT JOIN assistidos a2 ON a2.id = wc.assistido_id
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND nl.payload_recebido ? 'texto'
        AND (
          (a1.instituicao_id IS NULL OR a1.instituicao_id = p_instituicao_id)
          OR (a2.instituicao_id IS NULL OR a2.instituicao_id = p_instituicao_id)
        )
    ) x GROUP BY intencao ORDER BY COUNT(*) DESC LIMIT 10
  ) s;

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_top_fallback FROM (
    SELECT jsonb_build_object('motivo', motivo, 'total', COUNT(*)::int) AS r
    FROM (
      SELECT nl.payload_recebido->>'fallback_motivo' AS motivo
      FROM notificacoes_log nl
      LEFT JOIN notificacoes_fila nf ON nf.id = nl.fila_id
      LEFT JOIN whatsapp_conversas wc ON wc.telefone = nl.payload_recebido->>'telefone'
      LEFT JOIN assistidos a1 ON a1.id = nf.assistido_id
      LEFT JOIN assistidos a2 ON a2.id = wc.assistido_id
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND nl.payload_recebido->>'fallback_motivo' IS NOT NULL
        AND (
          (a1.instituicao_id IS NULL OR a1.instituicao_id = p_instituicao_id)
          OR (a2.instituicao_id IS NULL OR a2.instituicao_id = p_instituicao_id)
        )
    ) x GROUP BY motivo ORDER BY COUNT(*) DESC LIMIT 10
  ) s;

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_top_complexo FROM (
    SELECT jsonb_build_object('texto', LEFT(texto, 120), 'total', COUNT(*)::int) AS r
    FROM (
      SELECT nl.payload_recebido->>'texto' AS texto
      FROM notificacoes_log nl
      LEFT JOIN notificacoes_fila nf ON nf.id = nl.fila_id
      LEFT JOIN whatsapp_conversas wc ON wc.telefone = nl.payload_recebido->>'telefone'
      LEFT JOIN assistidos a1 ON a1.id = nf.assistido_id
      LEFT JOIN assistidos a2 ON a2.id = wc.assistido_id
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND nl.payload_recebido->>'intencao' = 'complexo'
        AND COALESCE(nl.payload_recebido->>'texto','') <> ''
        AND (
          (a1.instituicao_id IS NULL OR a1.instituicao_id = p_instituicao_id)
          OR (a2.instituicao_id IS NULL OR a2.instituicao_id = p_instituicao_id)
        )
    ) x GROUP BY texto ORDER BY COUNT(*) DESC LIMIT 15
  ) s;

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_escopo FROM (
    SELECT jsonb_build_object('escopo', COALESCE(escopo,'(sem)'), 'total', COUNT(*)::int) AS r
    FROM (
      SELECT nl.payload_recebido->>'escopo' AS escopo
      FROM notificacoes_log nl
      LEFT JOIN notificacoes_fila nf ON nf.id = nl.fila_id
      LEFT JOIN whatsapp_conversas wc ON wc.telefone = nl.payload_recebido->>'telefone'
      LEFT JOIN assistidos a1 ON a1.id = nf.assistido_id
      LEFT JOIN assistidos a2 ON a2.id = wc.assistido_id
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND nl.payload_recebido ? 'texto'
        AND (
          (a1.instituicao_id IS NULL OR a1.instituicao_id = p_instituicao_id)
          OR (a2.instituicao_id IS NULL OR a2.instituicao_id = p_instituicao_id)
        )
    ) x GROUP BY escopo
  ) s;

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
      LEFT JOIN notificacoes_fila nf ON nf.id = nl.fila_id
      LEFT JOIN whatsapp_conversas wc ON wc.telefone = nl.payload_recebido->>'telefone'
      LEFT JOIN assistidos a1 ON a1.id = nf.assistido_id
      LEFT JOIN assistidos a2 ON a2.id = wc.assistido_id
      WHERE nl.direcao='entrada' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
        AND COALESCE(nl.payload_recebido->>'texto','') <> ''
        AND (
          nl.payload_recebido->>'intencao' = 'complexo'
          OR nl.payload_recebido->>'fallback_motivo' IS NOT NULL
          OR (nl.payload_recebido->>'classificador_hibrido' = 'true'
              AND NULLIF(nl.payload_recebido->>'confianca_classificacao','')::numeric < 0.6)
        )
        AND (
          (a1.instituicao_id IS NULL OR a1.instituicao_id = p_instituicao_id)
          OR (a2.instituicao_id IS NULL OR a2.instituicao_id = p_instituicao_id)
        )
    ) x GROUP BY texto ORDER BY COUNT(*) DESC LIMIT 20
  ) s;

  SELECT
    COUNT(*) FILTER (WHERE nl.payload_enviado->>'autor' = 'ia')::int,
    COUNT(*) FILTER (WHERE nl.payload_enviado->>'usou_llm' = 'true')::int
  INTO v_respostas_ia, v_usou_llm
  FROM notificacoes_log nl
  JOIN notificacoes_fila nf ON nf.id = nl.fila_id
  JOIN assistidos a ON a.id = nf.assistido_id
  WHERE nl.direcao='saida' AND nl.created_at>=p_inicio AND nl.created_at<=p_fim
    AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id);

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE h.classificado_por_ia)::int
  INTO v_handoffs, v_handoffs_ia
  FROM whatsapp_handoffs h
  JOIN whatsapp_conversas c ON c.id = h.conversa_id
  LEFT JOIN assistidos a ON a.id = c.assistido_id
  WHERE h.created_at>=p_inicio AND h.created_at<=p_fim
    AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id);

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_top_handoff_motivos FROM (
    SELECT jsonb_build_object('motivo', COALESCE(motivo,'(sem)'), 'total', COUNT(*)::int) AS r
    FROM whatsapp_handoffs h
    JOIN whatsapp_conversas c ON c.id = h.conversa_id
    LEFT JOIN assistidos a ON a.id = c.assistido_id
    WHERE h.created_at>=p_inicio AND h.created_at<=p_fim
      AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    GROUP BY h.motivo ORDER BY COUNT(*) DESC LIMIT 10
  ) s;

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'total')::int DESC), '[]'::jsonb) INTO v_handoff_status FROM (
    SELECT jsonb_build_object('status', h.status::text, 'total', COUNT(*)::int) AS r
    FROM whatsapp_handoffs h
    JOIN whatsapp_conversas c ON c.id = h.conversa_id
    LEFT JOIN assistidos a ON a.id = c.assistido_id
    WHERE h.created_at>=p_inicio AND h.created_at<=p_fim
      AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    GROUP BY h.status
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
REVOKE EXECUTE ON FUNCTION public.metricas_ia_whatsapp(timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_ia_whatsapp(timestamptz, timestamptz, uuid) TO authenticated;
