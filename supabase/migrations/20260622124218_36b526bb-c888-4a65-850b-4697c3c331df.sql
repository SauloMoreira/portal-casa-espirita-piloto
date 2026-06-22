-- =====================================================================
-- FASE HOMOLOGAÇÃO CONTROLADA — porta única de conversão + rollback piloto
-- =====================================================================

-- A) CONVERTER ASSISTIDO (porta única, transacional, idempotente)
--    Liga o gate por assistido, neutraliza a agenda rígida longa e persiste o
--    plano previsto + a única etapa ativa. Reaproveita pts_persistir_plano para
--    não duplicar regra de gravação. Sem coexistência ambígua: toda sessão
--    'agendado' futura legada do vínculo vira 'substituida_plano'.
CREATE OR REPLACE FUNCTION public.pts_converter_assistido(
  p_assistido_id uuid,
  p_planos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plano jsonb;
  v_vinc_id uuid;
  v_planos_aplicados int := 0;
  v_sessoes_neutralizadas int := 0;
  v_n int;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'entrevistador')) THEN
    RAISE EXCEPTION 'Apenas administradores/entrevistadores podem converter assistidos.' USING ERRCODE='42501';
  END IF;

  -- Lock do assistido (concorrência: uma única conversão por vez)
  PERFORM 1 FROM assistidos WHERE id = p_assistido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assistido não encontrado.'; END IF;

  -- Liga o gate por assistido (idempotente)
  UPDATE assistidos SET usa_agenda_plano = true WHERE id = p_assistido_id;

  FOR v_plano IN SELECT * FROM jsonb_array_elements(COALESCE(p_planos,'[]'::jsonb))
  LOOP
    v_vinc_id := (v_plano->>'vinculo_id')::uuid;

    -- Vínculo precisa pertencer ao assistido (segurança/consistência)
    PERFORM 1 FROM assistido_tratamentos WHERE id = v_vinc_id AND assistido_id = p_assistido_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vínculo % não pertence ao assistido %.', v_vinc_id, p_assistido_id;
    END IF;

    -- Neutraliza TODA a agenda rígida futura do vínculo (sem coexistência).
    -- A etapa ativa será criada fresh por pts_persistir_plano (rollback limpo).
    UPDATE agenda_tratamentos_assistido
      SET status = 'substituida_plano', updated_at = now()
    WHERE assistido_tratamento_id = v_vinc_id
      AND status = 'agendado';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_sessoes_neutralizadas := v_sessoes_neutralizadas + v_n;

    -- Persiste o plano (etapas previstas + única ativa). Regra única de gravação.
    PERFORM pts_persistir_plano(v_vinc_id, v_plano->'etapas', v_plano->'sessao_ativa');
    v_planos_aplicados := v_planos_aplicados + 1;
  END LOOP;

  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (v_uid, 'assistidos', 'PLANO_CONVERSAO_PILOTO', p_assistido_id,
    jsonb_build_object('planos', v_planos_aplicados, 'sessoes_neutralizadas', v_sessoes_neutralizadas));

  RETURN jsonb_build_object('success', true, 'planos', v_planos_aplicados,
    'sessoes_neutralizadas', v_sessoes_neutralizadas);
END;
$$;

REVOKE ALL ON FUNCTION public.pts_converter_assistido(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_converter_assistido(uuid,jsonb) TO authenticated, service_role;

-- B) ROLLBACK DO PILOTO (reversão estrutural não destrutiva)
--    Desfaz a conversão: desliga o gate, remove o plano, restaura a agenda
--    rígida neutralizada e remove apenas as sessões ativas pendentes criadas
--    pelo plano. Preserva histórico real (sessões 'realizada'/'ausente' e
--    presenças permanecem). Reseta os contadores operacionais do novo modelo.
CREATE OR REPLACE FUNCTION public.pts_rollback_piloto(
  p_assistido_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sessoes_removidas int := 0;
  v_sessoes_restauradas int := 0;
  v_etapas_removidas int := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem reverter o piloto.' USING ERRCODE='42501';
  END IF;

  PERFORM 1 FROM assistidos WHERE id = p_assistido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assistido não encontrado.'; END IF;

  -- 1. Remove as sessões ativas pendentes criadas pelo plano (status 'agendado').
  --    Sessões já 'realizada'/'ausente' são histórico real e são preservadas.
  DELETE FROM agenda_tratamentos_assistido
  WHERE assistido_id = p_assistido_id
    AND status = 'agendado'
    AND id IN (
      SELECT agenda_sessao_id FROM plano_tratamento_sessoes
      WHERE assistido_id = p_assistido_id AND agenda_sessao_id IS NOT NULL
    );
  GET DIAGNOSTICS v_sessoes_removidas = ROW_COUNT;

  -- 2. Restaura a agenda rígida neutralizada.
  UPDATE agenda_tratamentos_assistido
    SET status = 'agendado', updated_at = now()
  WHERE assistido_id = p_assistido_id AND status = 'substituida_plano';
  GET DIAGNOSTICS v_sessoes_restauradas = ROW_COUNT;

  -- 3. Remove o plano previsto.
  DELETE FROM plano_tratamento_sessoes WHERE assistido_id = p_assistido_id;
  GET DIAGNOSTICS v_etapas_removidas = ROW_COUNT;

  -- 4. Reseta os contadores operacionais do novo modelo (não toca progresso real).
  UPDATE assistido_tratamentos SET
    faltas_consecutivas = 0,
    remarcacoes_automaticas = 0,
    ultima_presenca_em = NULL,
    ultimo_status_operacional = NULL
  WHERE assistido_id = p_assistido_id;

  -- 5. Desliga o gate por assistido.
  UPDATE assistidos SET usa_agenda_plano = false WHERE id = p_assistido_id;

  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (v_uid, 'assistidos', 'PLANO_ROLLBACK_PILOTO', p_assistido_id,
    jsonb_build_object('sessoes_removidas', v_sessoes_removidas,
      'sessoes_restauradas', v_sessoes_restauradas, 'etapas_removidas', v_etapas_removidas));

  RETURN jsonb_build_object('success', true,
    'sessoes_removidas', v_sessoes_removidas,
    'sessoes_restauradas', v_sessoes_restauradas,
    'etapas_removidas', v_etapas_removidas);
END;
$$;

REVOKE ALL ON FUNCTION public.pts_rollback_piloto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_rollback_piloto(uuid) TO authenticated, service_role;