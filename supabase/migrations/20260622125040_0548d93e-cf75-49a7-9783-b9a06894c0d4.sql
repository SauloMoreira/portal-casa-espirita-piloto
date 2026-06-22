CREATE OR REPLACE FUNCTION public.pts_persistir_plano(
  p_vinculo_id uuid,
  p_etapas jsonb,
  p_sessao_ativa jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vinc RECORD;
  v_etapa jsonb;
  v_ne int;
  v_status public.status_etapa_plano;
  v_sessao_id uuid;
  v_ativa_ne int;
  v_etapas_gravadas int := 0;
  v_tem_ativa boolean;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'entrevistador')) THEN
    RAISE EXCEPTION 'Apenas administradores/entrevistadores podem persistir plano.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_vinc FROM assistido_tratamentos WHERE id = p_vinculo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não encontrado.'; END IF;

  FOR v_etapa IN SELECT * FROM jsonb_array_elements(COALESCE(p_etapas,'[]'::jsonb))
  LOOP
    v_ne := (v_etapa->>'numero_etapa')::int;
    v_status := COALESCE(v_etapa->>'status_etapa','prevista')::public.status_etapa_plano;

    INSERT INTO plano_tratamento_sessoes (
      assistido_id, assistido_tratamento_id, tipo_tratamento_id,
      ordem_tratamento, numero_etapa, quantidade_total_do_tratamento,
      status_etapa, data_prevista, data_base_utilizada,
      eh_publico_livre, bloqueado_por_etapa_anterior, origem
    ) VALUES (
      v_vinc.assistido_id, p_vinculo_id, v_vinc.tratamento_id,
      (v_etapa->>'ordem_tratamento')::int, v_ne,
      (v_etapa->>'quantidade_total_do_tratamento')::int,
      v_status, NULLIF(v_etapa->>'data_prevista','')::date,
      NULLIF(v_etapa->>'data_base_utilizada','')::date,
      COALESCE((v_etapa->>'eh_publico_livre')::boolean,false),
      COALESCE((v_etapa->>'bloqueado_por_etapa_anterior')::boolean,false),
      COALESCE(v_etapa->>'origem','plano')
    )
    ON CONFLICT (assistido_tratamento_id, numero_etapa) DO UPDATE SET
      status_etapa = CASE
        WHEN plano_tratamento_sessoes.status_etapa IN ('realizada','ausente','suspensa','cancelada')
          THEN plano_tratamento_sessoes.status_etapa
        ELSE EXCLUDED.status_etapa END,
      data_prevista = CASE
        WHEN plano_tratamento_sessoes.status_etapa IN ('realizada','ausente','suspensa','cancelada')
          THEN plano_tratamento_sessoes.data_prevista
        ELSE EXCLUDED.data_prevista END,
      ordem_tratamento = EXCLUDED.ordem_tratamento,
      quantidade_total_do_tratamento = EXCLUDED.quantidade_total_do_tratamento,
      eh_publico_livre = EXCLUDED.eh_publico_livre,
      bloqueado_por_etapa_anterior = EXCLUDED.bloqueado_por_etapa_anterior,
      updated_at = now();
    v_etapas_gravadas := v_etapas_gravadas + 1;
  END LOOP;

  -- Trata jsonb null como ausência de sessão ativa (correção do bug de null).
  v_tem_ativa := p_sessao_ativa IS NOT NULL
    AND jsonb_typeof(p_sessao_ativa) <> 'null'
    AND NULLIF(p_sessao_ativa->>'data','') IS NOT NULL;

  IF v_tem_ativa THEN
    v_ativa_ne := (p_sessao_ativa->>'numero_etapa')::int;

    UPDATE plano_tratamento_sessoes
      SET status_etapa = 'prevista', updated_at = now()
    WHERE assistido_tratamento_id = p_vinculo_id
      AND status_etapa = 'ativa' AND numero_etapa <> v_ativa_ne;

    SELECT id INTO v_sessao_id FROM agenda_tratamentos_assistido
    WHERE assistido_tratamento_id = p_vinculo_id
      AND data_sessao = (p_sessao_ativa->>'data')::date
      AND status = 'agendado'
    LIMIT 1;

    IF v_sessao_id IS NULL THEN
      INSERT INTO agenda_tratamentos_assistido (
        assistido_id, assistido_tratamento_id, tratamento_id,
        data_sessao, horario, status, registrado_por
      ) VALUES (
        v_vinc.assistido_id, p_vinculo_id, v_vinc.tratamento_id,
        (p_sessao_ativa->>'data')::date, NULLIF(p_sessao_ativa->>'horario','')::time,
        'agendado', v_uid
      ) RETURNING id INTO v_sessao_id;
    END IF;

    UPDATE plano_tratamento_sessoes
      SET status_etapa = 'ativa', agenda_sessao_id = v_sessao_id,
          data_prevista = (p_sessao_ativa->>'data')::date, updated_at = now()
    WHERE assistido_tratamento_id = p_vinculo_id AND numero_etapa = v_ativa_ne
      AND status_etapa NOT IN ('realizada','ausente','suspensa','cancelada');
  END IF;

  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (v_uid, 'plano_tratamento_sessoes', 'PLANO_PERSISTIDO', p_vinculo_id,
    jsonb_build_object('etapas', v_etapas_gravadas, 'tem_ativa', v_tem_ativa));

  RETURN jsonb_build_object('success', true, 'etapas', v_etapas_gravadas, 'tem_ativa', v_tem_ativa);
END;
$$;

REVOKE ALL ON FUNCTION public.pts_persistir_plano(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_persistir_plano(uuid,jsonb,jsonb) TO authenticated, service_role;