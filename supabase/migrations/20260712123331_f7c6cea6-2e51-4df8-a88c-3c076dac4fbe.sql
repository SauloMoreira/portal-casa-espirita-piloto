-- SAAS-06-C1-STAB07-R1: reconciliação cirúrgica do vínculo histórico inconsistente
-- do Assistido Teste 01 / Reiki na FER Piloto. UPDATE de exatamente 1 linha, sob
-- FOR UPDATE, com precondições bloqueantes e checksum de sessões (byte-check).
-- Em ambientes sem os dados do piloto: NO-OP silencioso (RAISE NOTICE).
DO $$
DECLARE
  v_inst_fer            constant uuid := 'e3818702-cfac-47ae-b751-cb6a05babd4f';
  v_vinculo_id          constant uuid := 'cdad8c9e-6935-4590-b9a6-bad13bb9c2b2';
  v_assistido_esperado  constant uuid := 'aef9ab7d-1a51-4ea1-96a1-97e0d2879d8c';
  v_tratamento_esperado constant uuid := '6f3f9de7-597a-4bc4-92d4-16f221e13914';
  v_datas_esperadas     constant date[] := ARRAY[
    DATE '2026-07-16', DATE '2026-07-23', DATE '2026-07-30', DATE '2026-08-06'
  ];
  v_horario_esperado    constant time := TIME '18:36:00';

  v_fer_existe   boolean;
  v_vinc         public.assistido_tratamentos%ROWTYPE;
  v_count        int;
  v_min_data     date;
  v_max_data     date;
  v_reg_por      uuid;
  v_checksum_ini text;
  v_checksum_fim text;
  v_rows         int;
BEGIN
  -- (A) Ambiente sem FER Piloto: silencioso, encerra sem escrita.
  SELECT EXISTS(SELECT 1 FROM public.instituicoes WHERE id = v_inst_fer)
    INTO v_fer_existe;
  IF NOT v_fer_existe THEN
    RAISE NOTICE 'STAB07-R1: FER Piloto ausente — nada a reconciliar.';
    RETURN;
  END IF;

  -- (B) Piloto existe mas vínculo alvo não: se o assistido do piloto está lá,
  --     é anomalia real; se nem o assistido existe, também tratamos como NO-OP.
  IF NOT EXISTS (SELECT 1 FROM public.assistido_tratamentos WHERE id = v_vinculo_id) THEN
    IF EXISTS (
      SELECT 1 FROM public.assistidos
       WHERE id = v_assistido_esperado
         AND instituicao_id = v_inst_fer
    ) THEN
      RAISE EXCEPTION 'STAB07-R1: FER Piloto presente, assistido esperado presente, porém vínculo alvo % ausente.', v_vinculo_id;
    ELSE
      RAISE NOTICE 'STAB07-R1: contexto do piloto ausente — nada a reconciliar.';
      RETURN;
    END IF;
  END IF;

  -- (C) Lock exclusivo do vínculo (serializa com fn_confirmar_agendamento_tratamento).
  SELECT * INTO v_vinc
    FROM public.assistido_tratamentos
   WHERE id = v_vinculo_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAB07-R1: vínculo % desapareceu após check inicial.', v_vinculo_id;
  END IF;

  -- (D) Precondições do vínculo (invariantes do plano aprovado).
  IF v_vinc.assistido_id <> v_assistido_esperado THEN
    RAISE EXCEPTION 'STAB07-R1: assistido divergente (esperado %, obtido %).',
      v_assistido_esperado, v_vinc.assistido_id;
  END IF;
  IF v_vinc.tratamento_id <> v_tratamento_esperado THEN
    RAISE EXCEPTION 'STAB07-R1: tratamento divergente (esperado %, obtido %).',
      v_tratamento_esperado, v_vinc.tratamento_id;
  END IF;
  IF v_vinc.status <> 'aguardando_agendamento' THEN
    RAISE EXCEPTION 'STAB07-R1: status divergente = %.', v_vinc.status;
  END IF;
  IF v_vinc.data_inicio IS NOT NULL THEN
    RAISE EXCEPTION 'STAB07-R1: data_inicio já preenchida (%).', v_vinc.data_inicio;
  END IF;
  IF v_vinc.agendado_por IS NOT NULL THEN
    RAISE EXCEPTION 'STAB07-R1: agendado_por já preenchido (%).', v_vinc.agendado_por;
  END IF;
  IF v_vinc.quantidade_total <> 4 THEN
    RAISE EXCEPTION 'STAB07-R1: quantidade_total = %.', v_vinc.quantidade_total;
  END IF;
  IF v_vinc.quantidade_realizada <> 0 THEN
    RAISE EXCEPTION 'STAB07-R1: quantidade_realizada = %.', v_vinc.quantidade_realizada;
  END IF;
  IF v_vinc.updated_at > TIMESTAMPTZ '2026-07-11 00:00:00+00' THEN
    RAISE EXCEPTION 'STAB07-R1: updated_at incompatível com estado pré-agendamento (%).', v_vinc.updated_at;
  END IF;

  -- (E) Precondições das sessões (conjunto, datas, horário, tenant, assistido).
  SELECT COUNT(*), MIN(data_sessao), MAX(data_sessao)
    INTO v_count, v_min_data, v_max_data
    FROM public.agenda_tratamentos_assistido
   WHERE assistido_tratamento_id = v_vinculo_id;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'STAB07-R1: quantidade de sessões = % (esperado 4).', v_count;
  END IF;
  IF v_min_data <> DATE '2026-07-16' OR v_max_data <> DATE '2026-08-06' THEN
    RAISE EXCEPTION 'STAB07-R1: intervalo de sessões divergente [%, %].', v_min_data, v_max_data;
  END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM public.agenda_tratamentos_assistido
   WHERE assistido_tratamento_id = v_vinculo_id
     AND assistido_id            = v_assistido_esperado
     AND tratamento_id           = v_tratamento_esperado
     AND status                  = 'agendado'
     AND horario                 = v_horario_esperado
     AND data_sessao             = ANY(v_datas_esperadas);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'STAB07-R1: sessões não conferem com o conjunto canônico esperado.';
  END IF;

  SELECT COUNT(DISTINCT registrado_por)
    INTO v_count
    FROM public.agenda_tratamentos_assistido
   WHERE assistido_tratamento_id = v_vinculo_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'STAB07-R1: registrado_por não uniforme (distintos=%).', v_count;
  END IF;

  SELECT DISTINCT registrado_por
    INTO v_reg_por
    FROM public.agenda_tratamentos_assistido
   WHERE assistido_tratamento_id = v_vinculo_id;
  IF v_reg_por IS NULL THEN
    RAISE EXCEPTION 'STAB07-R1: registrado_por das sessões é nulo.';
  END IF;

  -- (F) Presenças (nenhuma).
  SELECT COUNT(*)
    INTO v_count
    FROM public.presencas_tratamentos
   WHERE assistido_tratamento_id = v_vinculo_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'STAB07-R1: existem % presenças associadas — abortando.', v_count;
  END IF;

  -- (G) Checksum determinístico das sessões (byte-check antes/depois).
  SELECT md5(string_agg(
           id::text || '|' || data_sessao::text || '|' || horario::text || '|' ||
           status || '|' || registrado_por::text || '|' || assistido_id::text || '|' ||
           tratamento_id::text || '|' || assistido_tratamento_id::text || '|' ||
           COALESCE(created_at::text, ''),
           ',' ORDER BY id))
    INTO v_checksum_ini
    FROM public.agenda_tratamentos_assistido
   WHERE assistido_tratamento_id = v_vinculo_id;

  -- (H) UPDATE cirúrgico — exatamente 1 linha, apenas 3 campos.
  UPDATE public.assistido_tratamentos
     SET status       = 'aguardando_inicio',
         data_inicio  = v_min_data,
         agendado_por = v_reg_por
   WHERE id           = v_vinculo_id
     AND status       = 'aguardando_agendamento'
     AND data_inicio  IS NULL
     AND agendado_por IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'STAB07-R1: ROW_COUNT do UPDATE = % (esperado 1).', v_rows;
  END IF;

  -- (I) Verificação pós-UPDATE na MESMA transação.
  SELECT * INTO v_vinc FROM public.assistido_tratamentos WHERE id = v_vinculo_id;
  IF v_vinc.status <> 'aguardando_inicio' THEN
    RAISE EXCEPTION 'STAB07-R1 pós: status = %.', v_vinc.status;
  END IF;
  IF v_vinc.data_inicio <> DATE '2026-07-16' THEN
    RAISE EXCEPTION 'STAB07-R1 pós: data_inicio = %.', v_vinc.data_inicio;
  END IF;
  IF v_vinc.agendado_por <> v_reg_por THEN
    RAISE EXCEPTION 'STAB07-R1 pós: agendado_por divergente.';
  END IF;
  IF v_vinc.quantidade_total <> 4 OR v_vinc.quantidade_realizada <> 0 THEN
    RAISE EXCEPTION 'STAB07-R1 pós: quantidades foram alteradas.';
  END IF;

  SELECT md5(string_agg(
           id::text || '|' || data_sessao::text || '|' || horario::text || '|' ||
           status || '|' || registrado_por::text || '|' || assistido_id::text || '|' ||
           tratamento_id::text || '|' || assistido_tratamento_id::text || '|' ||
           COALESCE(created_at::text, ''),
           ',' ORDER BY id))
    INTO v_checksum_fim
    FROM public.agenda_tratamentos_assistido
   WHERE assistido_tratamento_id = v_vinculo_id;
  IF v_checksum_fim IS DISTINCT FROM v_checksum_ini THEN
    RAISE EXCEPTION 'STAB07-R1 pós: checksum das sessões mudou — abortando.';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.presencas_tratamentos
   WHERE assistido_tratamento_id = v_vinculo_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'STAB07-R1 pós: presenças foram criadas (%).', v_count;
  END IF;

  RAISE NOTICE 'STAB07-R1: vínculo % reconciliado (data_inicio=%, agendado_por=%).',
    v_vinculo_id, v_min_data, v_reg_por;
END $$;