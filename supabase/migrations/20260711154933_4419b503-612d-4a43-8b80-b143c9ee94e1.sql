CREATE OR REPLACE FUNCTION public.fn_lista_espera_coordenador(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  id uuid,
  assistido_id uuid,
  assistido_nome text,
  tratamento_id uuid,
  tratamento_nome text,
  quantidade_total integer,
  quantidade_realizada integer,
  entrevista_id uuid,
  entrevista_data date,
  status text,
  tratamento_tipo text,
  dia_semana integer,
  horario time without time zone,
  frequencia_valor integer,
  frequencia_unidade text,
  modo_agendamento text,
  trabalho_publico boolean,
  permite_entrada_sem_agendamento boolean,
  prioridade text,
  urgencia text,
  origem text,
  created_at timestamp with time zone,
  tem_sessao_futura_valida boolean,
  tem_etapa_ativa_valida boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF NOT public.has_role(auth.uid(), 'coordenador_de_tratamento') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    atr.id,
    atr.assistido_id,
    COALESCE(NULLIF(a.nome, ''), 'Assistido não localizado — abrir chamado técnico') AS assistido_nome,
    atr.tratamento_id,
    COALESCE(NULLIF(tt.nome, ''), '—') AS tratamento_nome,
    COALESCE(atr.quantidade_total, 0) AS quantidade_total,
    COALESCE(atr.quantidade_realizada, 0) AS quantidade_realizada,
    atr.entrevista_id,
    ef.data::date AS entrevista_data,
    atr.status,
    tt.tipo AS tratamento_tipo,
    tt.dia_semana,
    tt.horario,
    tt.frequencia_valor,
    tt.frequencia_unidade,
    tt.modo_agendamento,
    COALESCE(tt.trabalho_publico, false) AS trabalho_publico,
    COALESCE(tt.permite_entrada_sem_agendamento, false) AS permite_entrada_sem_agendamento,
    COALESCE(NULLIF(atr.prioridade, ''), 'normal') AS prioridade,
    atr.urgencia,
    atr.origem,
    atr.created_at,
    EXISTS (
      SELECT 1
      FROM public.agenda_tratamentos_assistido ag
      WHERE ag.assistido_tratamento_id = atr.id
        AND ag.status = 'agendado'
        AND ag.data_sessao >= CURRENT_DATE
    ) AS tem_sessao_futura_valida,
    EXISTS (
      SELECT 1
      FROM public.plano_tratamento_sessoes pts
      WHERE pts.assistido_tratamento_id = atr.id
        AND pts.status_etapa = 'ativa'
    ) AS tem_etapa_ativa_valida
  FROM public.assistido_tratamentos atr
  JOIN public.assistidos a ON a.id = atr.assistido_id
  JOIN public.tipos_tratamento tt ON tt.id = atr.tratamento_id
  LEFT JOIN public.entrevistas_fraternas ef ON ef.id = atr.entrevista_id
  WHERE atr.tratamento_id IN (
    SELECT public.fn_tratamentos_do_coordenador(auth.uid())
  )
    AND atr.status IN ('aguardando_agendamento', 'aguardando_inicio', 'liberado', 'em_andamento')
    AND COALESCE(atr.quantidade_total, 0) - COALESCE(atr.quantidade_realizada, 0) > 0
  ORDER BY atr.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_lista_espera_coordenador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lista_espera_coordenador(uuid) TO authenticated, service_role;