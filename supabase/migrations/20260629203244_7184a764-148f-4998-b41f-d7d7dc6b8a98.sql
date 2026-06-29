
-- =============================================================
-- S1 / Lote 1 — Endurecimento de superfície de funções
-- =============================================================

-- 1) registrar_presenca: deixar de confiar em p_registrado_por,
--    usar auth.uid() como fonte de verdade e validar papel autorizado.
CREATE OR REPLACE FUNCTION public.registrar_presenca(
  p_assistido_tratamento_id uuid,
  p_data date,
  p_status_presenca text,
  p_registrado_por uuid,
  p_observacao text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_at RECORD;
  v_result jsonb;
BEGIN
  -- Autenticação obrigatória
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Autorização interna: apenas tarefeiro, admin ou administrador_master
  IF NOT (
    has_role(v_uid, 'tarefeiro'::app_role)
    OR has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'administrador_master'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registrar presença';
  END IF;

  -- Vínculo
  SELECT * INTO v_at FROM assistido_tratamentos WHERE id = p_assistido_tratamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo assistido-tratamento não encontrado';
  END IF;

  -- Duplicidade na mesma data
  IF EXISTS (
    SELECT 1 FROM presencas_tratamentos
    WHERE assistido_tratamento_id = p_assistido_tratamento_id AND data = p_data
  ) THEN
    RAISE EXCEPTION 'Presença já registrada para esta data';
  END IF;

  -- Insere usando o usuário autenticado como registrador (ignora p_registrado_por)
  INSERT INTO presencas_tratamentos (assistido_tratamento_id, data, status_presenca, registrado_por, observacao)
  VALUES (p_assistido_tratamento_id, p_data, p_status_presenca, v_uid, p_observacao);

  IF p_status_presenca = 'presente' THEN
    IF v_at.quantidade_realizada >= v_at.quantidade_total THEN
      RAISE EXCEPTION 'Quantidade total de sessões já atingida';
    END IF;

    UPDATE assistido_tratamentos
    SET quantidade_realizada = quantidade_realizada + 1,
        status = CASE WHEN status = 'aguardando_inicio' THEN 'em_andamento' ELSE status END
    WHERE id = p_assistido_tratamento_id;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'quantidade_realizada', at2.quantidade_realizada,
    'quantidade_faltante', at2.quantidade_faltante,
    'status', at2.status
  ) INTO v_result
  FROM assistido_tratamentos at2 WHERE at2.id = p_assistido_tratamento_id;

  RETURN v_result;
END;
$function$;

-- 2) Endurecimento em massa da superfície de funções.
--    Para toda função public hoje executável por anon (via grant explícito
--    e/ou via grant default PUBLIC):
--      - REVOKE de PUBLIC e anon (todas)
--      - funções 100% internas: REVOKE também de authenticated (service_role mantém)
--      - demais funções (não-trigger): GRANT a authenticated (exigir login)
--      - triggers: apenas revoga (não precisam de EXECUTE para disparar)
DO $$
DECLARE
  r record;
  v_internas text[] := ARRAY[
    'fn_enqueue_notificacao',
    'fn_promover_proxima_sessao',
    'marcar_envio_concluido'
  ];
  v_args text;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           (p.prorettype = 'trigger'::regtype) AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    v_args := pg_get_function_identity_arguments(r.oid);

    -- Remove acesso anônimo e o grant default PUBLIC de todas
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, v_args);

    IF r.proname = ANY(v_internas) THEN
      -- 100% internas: também remove authenticated (mantém service_role)
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', r.proname, v_args);
    ELSIF NOT r.is_trigger THEN
      -- demais RPCs: exigir login (authenticated mantém/recebe acesso)
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, v_args);
    END IF;
  END LOOP;
END $$;
