CREATE OR REPLACE FUNCTION public.fn_excecao_alvos(p_excecao_id uuid)
 RETURNS TABLE(dominio text, sessao_ref uuid, compromisso_id uuid, assistido_id uuid, telefone text, nome text, tratamento text, data_impactada date, horario_impactado time without time zone, usou_fallback_nome boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e record;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO e FROM excecoes_operacionais WHERE id = p_excecao_id;
  IF NOT FOUND OR e.ativo = false THEN RETURN; END IF;

  -- ===== TRATAMENTO (agenda rígida) =====
  IF e.tipo = 'tratamento' THEN
    RETURN QUERY
    SELECT 'tratamento'::text,
           a.id, a.id, a.assistido_id,
           fn_normalize_phone(COALESCE(asd.celular, asd.telefone)),
           asd.nome, tt.nome, a.data_sessao, a.horario,
           (e.tratamento_id IS NULL)
    FROM agenda_tratamentos_assistido a
    JOIN assistidos asd ON asd.id = a.assistido_id
    LEFT JOIN tipos_tratamento tt ON tt.id = a.tratamento_id
    WHERE a.status = 'agendado'
      AND a.data_sessao = e.data_excecao
      AND (e.horario_afetado IS NULL OR a.horario = e.horario_afetado)
      AND (
        (e.tratamento_id IS NOT NULL AND a.tratamento_id = e.tratamento_id)
        OR (e.tratamento_id IS NULL AND tt.nome IS NOT DISTINCT FROM e.atividade)
      )
      AND (a.data_sessao::timestamp + COALESCE(a.horario, '08:00'::time))
            AT TIME ZONE 'America/Sao_Paulo' > v_now;
  END IF;

  -- ===== ENTREVISTA =====
  IF e.tipo = 'entrevista' THEN
    RETURN QUERY
    SELECT 'entrevista'::text,
           ef.id, ef.id, ef.assistido_id,
           fn_normalize_phone(COALESCE(asd.celular, asd.telefone)),
           asd.nome, NULL::text, ef.data::date, ef.data::time,
           false
    FROM entrevistas_fraternas ef
    JOIN assistidos asd ON asd.id = ef.assistido_id
    WHERE ef.data::date = e.data_excecao
      AND (e.horario_afetado IS NULL OR ef.data::time = e.horario_afetado)
      AND ef.status NOT IN ('cancelada', 'remarcada', 'concluida', 'realizada')
      AND ef.data > v_now;
  END IF;

  -- ===== PÚBLICO =====
  IF e.tipo = 'publico' THEN
    -- (a) Participantes rastreáveis em check-in público
    RETURN QUERY
    SELECT 'publico'::text,
           sp.id, cp.id, cp.assistido_id,
           fn_normalize_phone(COALESCE(asd.celular, asd.telefone, cp.celular)),
           COALESCE(asd.nome, cp.nome_participante), tt.nome, sp.data_sessao, sp.horario_inicio,
           (e.tratamento_id IS NULL)
    FROM sessoes_publicas sp
    JOIN checkins_publicos cp ON cp.sessao_id = sp.id
    LEFT JOIN assistidos asd ON asd.id = cp.assistido_id
    LEFT JOIN tipos_tratamento tt ON tt.id = sp.tratamento_id
    WHERE sp.data_sessao = e.data_excecao
      AND sp.status <> 'cancelado'
      AND (
        (e.tratamento_id IS NOT NULL AND sp.tratamento_id = e.tratamento_id)
        OR (e.tratamento_id IS NULL AND tt.nome IS NOT DISTINCT FROM e.atividade)
      )
      AND (cp.assistido_id IS NOT NULL OR cp.celular IS NOT NULL);

    -- (b) Atividades coletivas registradas na agenda de tratamento.
    -- Atividades como Desobsessão/Homeopatia são cadastradas como exceção do
    -- tipo "público" mas têm compromissos reais por assistido na agenda de
    -- tratamento. Aqui esses compromissos são capturados pelo NOME da atividade
    -- (+ data e, se informado, horário), retornados como domínio 'tratamento'
    -- para que o pipeline oficial cancele a sessão e envie o template correto.
    RETURN QUERY
    SELECT 'tratamento'::text,
           a.id, a.id, a.assistido_id,
           fn_normalize_phone(COALESCE(asd.celular, asd.telefone)),
           asd.nome, tt.nome, a.data_sessao, a.horario,
           (e.tratamento_id IS NULL)
    FROM agenda_tratamentos_assistido a
    JOIN assistidos asd ON asd.id = a.assistido_id
    LEFT JOIN tipos_tratamento tt ON tt.id = a.tratamento_id
    WHERE a.status = 'agendado'
      AND a.data_sessao = e.data_excecao
      AND (e.horario_afetado IS NULL OR a.horario = e.horario_afetado)
      AND (
        (e.tratamento_id IS NOT NULL AND a.tratamento_id = e.tratamento_id)
        OR (e.tratamento_id IS NULL AND tt.nome IS NOT DISTINCT FROM e.atividade)
      )
      AND (a.data_sessao::timestamp + COALESCE(a.horario, '08:00'::time))
            AT TIME ZONE 'America/Sao_Paulo' > v_now;
  END IF;
END
$function$;