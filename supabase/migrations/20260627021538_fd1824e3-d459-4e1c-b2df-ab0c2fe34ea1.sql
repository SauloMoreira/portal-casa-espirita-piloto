-- ETAPA 5 — Escopo Operacional / Coordenação N:N
-- 1) Tabela de relação N:N coordenacao_tratamento
CREATE TABLE IF NOT EXISTS public.coordenacao_tratamento (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tratamento_id uuid NOT NULL REFERENCES public.tipos_tratamento(id) ON DELETE CASCADE,
  coordenador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (tratamento_id, coordenador_id)
);

GRANT SELECT ON public.coordenacao_tratamento TO authenticated;
GRANT ALL ON public.coordenacao_tratamento TO service_role;

ALTER TABLE public.coordenacao_tratamento ENABLE ROW LEVEL SECURITY;

-- Leitura: admin/master veem tudo; coordenador vê apenas suas próprias designações.
CREATE POLICY "Escopo - admin le tudo"
  ON public.coordenacao_tratamento FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'administrador_master')
  );

CREATE POLICY "Escopo - coordenador le proprias designacoes"
  ON public.coordenacao_tratamento FOR SELECT TO authenticated
  USING (coordenador_id = auth.uid());

-- Sem políticas de escrita: designação/remoção apenas via RPC SECURITY DEFINER.

-- 2) Backfill do campo único atual para a relação N:N (idempotente)
INSERT INTO public.coordenacao_tratamento (tratamento_id, coordenador_id, created_by)
SELECT tt.id, tt.coordenador_responsavel_id, tt.coordenador_responsavel_id
FROM public.tipos_tratamento tt
WHERE tt.coordenador_responsavel_id IS NOT NULL
ON CONFLICT (tratamento_id, coordenador_id) DO NOTHING;

-- 3) Leitura centralizada (fonte única) via funções SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.fn_tratamentos_do_coordenador(_user_id uuid DEFAULT auth.uid())
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tratamento_id FROM public.coordenacao_tratamento WHERE coordenador_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.fn_coordena_tratamento(_user_id uuid, _tratamento_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coordenacao_tratamento
    WHERE coordenador_id = _user_id AND tratamento_id = _tratamento_id
  )
$$;

-- 4) Reescrever policies que dependiam do campo único
DROP POLICY IF EXISTS "Coordenador reads assistido_tratamentos" ON public.assistido_tratamentos;
CREATE POLICY "Coordenador reads assistido_tratamentos"
  ON public.assistido_tratamentos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_de_tratamento')
    AND tratamento_id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid()))
  );

DROP POLICY IF EXISTS "Coordenador updates assistido_tratamentos" ON public.assistido_tratamentos;
CREATE POLICY "Coordenador updates assistido_tratamentos"
  ON public.assistido_tratamentos FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_de_tratamento')
    AND tratamento_id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador_de_tratamento')
    AND tratamento_id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid()))
  );

DROP POLICY IF EXISTS "Coordenador reads agenda_tratamentos" ON public.agenda_tratamentos_assistido;
CREATE POLICY "Coordenador reads agenda_tratamentos"
  ON public.agenda_tratamentos_assistido FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_de_tratamento')
    AND tratamento_id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid()))
  );

DROP POLICY IF EXISTS "Coordenador inserts agenda_tratamentos" ON public.agenda_tratamentos_assistido;
CREATE POLICY "Coordenador inserts agenda_tratamentos"
  ON public.agenda_tratamentos_assistido FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador_de_tratamento')
    AND tratamento_id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid()))
  );

DROP POLICY IF EXISTS "Coordenador reads plano_tratamento_sessoes" ON public.plano_tratamento_sessoes;
CREATE POLICY "Coordenador reads plano_tratamento_sessoes"
  ON public.plano_tratamento_sessoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
    AND tipo_tratamento_id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid()))
  );

DROP POLICY IF EXISTS "Coordenador updates plano_tratamento_sessoes" ON public.plano_tratamento_sessoes;
CREATE POLICY "Coordenador updates plano_tratamento_sessoes"
  ON public.plano_tratamento_sessoes FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
    AND tipo_tratamento_id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
    AND tipo_tratamento_id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid()))
  );

-- 5) Reescrever funções booleanas de pertencimento
CREATE OR REPLACE FUNCTION public.assistido_belongs_to_coordinator(_assistido_id uuid, _coordinator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assistido_tratamentos at
    JOIN coordenacao_tratamento ct ON ct.tratamento_id = at.tratamento_id
    WHERE at.assistido_id = _assistido_id
      AND ct.coordenador_id = _coordinator_id
  )
$$;

CREATE OR REPLACE FUNCTION public.entrevista_assistido_belongs_to_coordinator(_assistido_id uuid, _coordinator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assistido_tratamentos at
    JOIN coordenacao_tratamento ct ON ct.tratamento_id = at.tratamento_id
    WHERE at.assistido_id = _assistido_id
      AND ct.coordenador_id = _coordinator_id
  )
$$;

-- 6) Reescrever funções de relatório (escopo por coordenação N:N)
CREATE OR REPLACE FUNCTION public.relatorio_faltas_periodo(p_data_inicio date, p_data_fim date, p_tratamento_id uuid DEFAULT NULL::uuid, p_assistido_id uuid DEFAULT NULL::uuid, p_tarefeiro_id uuid DEFAULT NULL::uuid, p_coordenador_id uuid DEFAULT NULL::uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := has_role(auth.uid(), 'admin');
  v_is_coord boolean := has_role(auth.uid(), 'coordenador_de_tratamento');
  v_is_taref boolean := has_role(auth.uid(), 'tarefeiro');
  v_size integer := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_size;
  v_registros integer;
  v_totais jsonb;
  v_rows jsonb;
BEGIN
  WITH grouped AS (
    SELECT
      a.nome AS assistido,
      tt.nome AS tratamento,
      COUNT(*) FILTER (WHERE pt.status_presenca = 'ausente') AS total_faltas,
      ARRAY_AGG(pt.data::text ORDER BY pt.data) FILTER (WHERE pt.status_presenca = 'ausente') AS datas,
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
      AND (p_coordenador_id IS NULL OR public.fn_coordena_tratamento(p_coordenador_id, tt.id))
      AND (v_is_admin OR NOT v_is_coord OR tt.id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid())))
      AND (v_is_admin OR NOT v_is_taref OR tt.tarefeiro_id IS NULL OR tt.tarefeiro_id = auth.uid())
    GROUP BY pt.assistido_tratamento_id, a.nome, tt.nome
    HAVING COUNT(*) FILTER (WHERE pt.status_presenca = 'ausente') > 0
  )
  SELECT
    (SELECT COUNT(*) FROM grouped),
    (SELECT jsonb_build_object(
       'total_faltas', COALESCE(SUM(total_faltas), 0),
       'assistidos_com_falta', COALESCE(COUNT(DISTINCT assistido), 0),
       'pct_medio', COALESCE(ROUND(AVG(
         CASE WHEN total_sessoes > 0 THEN total_faltas::numeric / total_sessoes * 100 ELSE 0 END
       )), 0),
       'vinculos_com_falta', COUNT(*)
     ) FROM grouped),
    (SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) FROM (
       SELECT
         assistido, tratamento, total_faltas, datas, total_sessoes,
         CASE WHEN total_sessoes > 0 THEN ROUND(total_faltas::numeric / total_sessoes * 100) ELSE 0 END AS percentual
       FROM grouped
       ORDER BY total_faltas DESC
       LIMIT v_size OFFSET v_offset
     ) r)
  INTO v_registros, v_totais, v_rows;

  RETURN jsonb_build_object('registros', v_registros, 'totais', v_totais, 'rows', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_frequencia_presenca(p_data_inicio date, p_data_fim date, p_tratamento_id uuid DEFAULT NULL::uuid, p_assistido_id uuid DEFAULT NULL::uuid, p_tarefeiro_id uuid DEFAULT NULL::uuid, p_coordenador_id uuid DEFAULT NULL::uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := has_role(auth.uid(), 'admin');
  v_is_coord boolean := has_role(auth.uid(), 'coordenador_de_tratamento');
  v_is_taref boolean := has_role(auth.uid(), 'tarefeiro');
  v_size integer := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_size;
  v_registros integer;
  v_totais jsonb;
  v_rows jsonb;
BEGIN
  WITH grouped AS (
    SELECT
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
      AND (p_coordenador_id IS NULL OR public.fn_coordena_tratamento(p_coordenador_id, tt.id))
      AND (v_is_admin OR NOT v_is_coord OR tt.id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid())))
      AND (v_is_admin OR NOT v_is_taref OR tt.tarefeiro_id IS NULL OR tt.tarefeiro_id = auth.uid())
    GROUP BY pt.assistido_tratamento_id, a.nome, tt.nome
  )
  SELECT
    (SELECT COUNT(*) FROM grouped),
    (SELECT jsonb_build_object(
       'total', COALESCE(SUM(total), 0),
       'presencas', COALESCE(SUM(presencas), 0),
       'ausencias', COALESCE(SUM(ausencias), 0)
     ) FROM grouped),
    (SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) FROM (
       SELECT
         nome, tratamento, presencas, ausencias, total,
         CASE WHEN total > 0 THEN ROUND(presencas::numeric / total * 100) ELSE 0 END AS percentual
       FROM grouped
       ORDER BY nome ASC
       LIMIT v_size OFFSET v_offset
     ) r)
  INTO v_registros, v_totais, v_rows;

  RETURN jsonb_build_object('registros', v_registros, 'totais', v_totais, 'rows', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_tratamentos_concluidos(p_data_inicio date, p_data_fim date, p_tratamento_id uuid DEFAULT NULL::uuid, p_tipo text DEFAULT NULL::text, p_tarefeiro_id uuid DEFAULT NULL::uuid, p_coordenador_id uuid DEFAULT NULL::uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := has_role(auth.uid(), 'admin');
  v_is_coord boolean := has_role(auth.uid(), 'coordenador_de_tratamento');
  v_is_taref boolean := has_role(auth.uid(), 'tarefeiro');
  v_size integer := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_size;
  v_registros integer;
  v_totais jsonb;
  v_rows jsonb;
  v_por_tratamento jsonb;
  v_por_tipo jsonb;
BEGIN
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
    COALESCE((
      SELECT string_agg(pc.nome_completo, ', ' ORDER BY pc.nome_completo)
      FROM coordenacao_tratamento ct
      JOIN profiles pc ON pc.user_id = ct.coordenador_id
      WHERE ct.tratamento_id = tt.id
    ), '—') AS coordenador
  FROM assistido_tratamentos at
  JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
  JOIN assistidos a ON a.id = at.assistido_id
  LEFT JOIN profiles pt ON pt.user_id = tt.tarefeiro_id
  WHERE at.status = 'concluido'
    AND at.updated_at >= p_data_inicio::timestamp
    AND at.updated_at <= (p_data_fim::timestamp + interval '1 day' - interval '1 second')
    AND (p_tratamento_id IS NULL OR at.tratamento_id = p_tratamento_id)
    AND (p_tipo IS NULL OR tt.tipo = p_tipo)
    AND (p_tarefeiro_id IS NULL OR tt.tarefeiro_id = p_tarefeiro_id)
    AND (p_coordenador_id IS NULL OR public.fn_coordena_tratamento(p_coordenador_id, tt.id))
    AND (v_is_admin OR NOT v_is_coord OR tt.id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid())))
    AND (v_is_admin OR NOT v_is_taref OR tt.tarefeiro_id IS NULL OR tt.tarefeiro_id = auth.uid());

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

-- 7) Agora é seguro remover o campo único
ALTER TABLE public.tipos_tratamento DROP COLUMN IF EXISTS coordenador_responsavel_id;

-- 8) RPCs de gestão do escopo operacional (designação/remoção) — admin/master apenas
CREATE OR REPLACE FUNCTION public.fn_designar_coordenador(p_tratamento_id uuid, p_coordenador_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'administrador_master')) THEN
    RAISE EXCEPTION 'Apenas administradores podem designar coordenadores';
  END IF;
  INSERT INTO public.coordenacao_tratamento (tratamento_id, coordenador_id, created_by)
  VALUES (p_tratamento_id, p_coordenador_id, auth.uid())
  ON CONFLICT (tratamento_id, coordenador_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_remover_coordenador(p_tratamento_id uuid, p_coordenador_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'administrador_master')) THEN
    RAISE EXCEPTION 'Apenas administradores podem remover coordenadores';
  END IF;
  DELETE FROM public.coordenacao_tratamento
  WHERE tratamento_id = p_tratamento_id AND coordenador_id = p_coordenador_id;
END;
$$;

-- 9) Leitura consolidada para a área de gestão de escopo + alerta de coerência (consultivo)
CREATE OR REPLACE FUNCTION public.fn_listar_coordenacao_tratamentos()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'administrador_master')
    OR public.has_role(auth.uid(), 'coordenador_de_tratamento')
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'tratamento_nome'), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'tratamento_id', tt.id,
      'tratamento_nome', tt.nome,
      'tratamento_tipo', COALESCE(NULLIF(tt.tipo, ''), '—'),
      'coordenadores', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'coordenador_id', ct.coordenador_id,
          'nome', COALESCE(pc.nome_completo, '—'),
          -- alerta de coerência consultivo: designado sem o acesso correspondente
          'tem_acesso', public.has_role(ct.coordenador_id, 'coordenador_de_tratamento')
        ) ORDER BY pc.nome_completo)
        FROM coordenacao_tratamento ct
        LEFT JOIN profiles pc ON pc.user_id = ct.coordenador_id
        WHERE ct.tratamento_id = tt.id
      ), '[]'::jsonb)
    ) AS row
    FROM tipos_tratamento tt
    WHERE tt.status <> 'arquivado'
  ) s;

  RETURN v_result;
END;
$$;