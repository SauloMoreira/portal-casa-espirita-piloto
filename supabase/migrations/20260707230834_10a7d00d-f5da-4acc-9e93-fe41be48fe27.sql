
-- SAAS-05-E1 — RPCs tenant-aware internas (lote 1) do módulo Tratamentos.
-- Novas assinaturas com `p_instituicao_id` obrigatório; assinaturas legadas
-- preservadas para não quebrar callers internos (ex.: cron via
-- fn_reconciliar_excecoes_notificacoes).

-- 1) gerenciar_voluntario
CREATE OR REPLACE FUNCTION public.gerenciar_voluntario(
  p_action text, p_voluntario_id uuid, p_motivo text, p_instituicao_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
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
  IF p_voluntario_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.voluntarios v
    WHERE v.id = p_voluntario_id
      AND v.instituicao_id IS NOT NULL
      AND v.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Voluntário não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.gerenciar_voluntario(p_action, p_voluntario_id, p_motivo);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.gerenciar_voluntario(text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_voluntario(text, uuid, text, uuid) TO authenticated;

-- 2) gerenciar_termo_voluntario
CREATE OR REPLACE FUNCTION public.gerenciar_termo_voluntario(
  p_action text, p_voluntario_id uuid, p_path text, p_nome text, p_motivo text, p_instituicao_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
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
  IF p_voluntario_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.voluntarios v
    WHERE v.id = p_voluntario_id
      AND v.instituicao_id IS NOT NULL
      AND v.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Voluntário não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.gerenciar_termo_voluntario(p_action, p_voluntario_id, p_path, p_nome, p_motivo);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.gerenciar_termo_voluntario(text, uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_termo_voluntario(text, uuid, text, text, text, uuid) TO authenticated;

-- 3) fn_buscar_pessoa_para_voluntario
CREATE OR REPLACE FUNCTION public.fn_buscar_pessoa_para_voluntario(
  p_termo text, p_instituicao_id uuid
) RETURNS TABLE (
  origem text, origem_id uuid, user_id uuid, nome text, cpf text, celular text,
  email text, data_nascimento date, cep text, logradouro text, numero text,
  complemento text, bairro text, cidade text, estado text, foto_url text,
  ja_voluntario boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
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
  RETURN QUERY SELECT * FROM public.fn_buscar_pessoa_para_voluntario(p_termo);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_buscar_pessoa_para_voluntario(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_buscar_pessoa_para_voluntario(text, uuid) TO authenticated;

-- 4) fn_processar_excecao_notificacoes
CREATE OR REPLACE FUNCTION public.fn_processar_excecao_notificacoes(
  p_excecao_id uuid, p_instituicao_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_inst uuid;
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
  SELECT instituicao_id INTO v_inst FROM public.excecoes_operacionais WHERE id = p_excecao_id;
  IF v_inst IS NOT NULL AND v_inst <> p_instituicao_id THEN
    RAISE EXCEPTION 'Exceção não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.fn_processar_excecao_notificacoes(p_excecao_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_processar_excecao_notificacoes(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_processar_excecao_notificacoes(uuid, uuid) TO authenticated;

-- 5) fn_monitor_excecao_notificacoes
CREATE OR REPLACE FUNCTION public.fn_monitor_excecao_notificacoes(
  p_desde timestamptz, p_instituicao_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
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
  RETURN public.fn_monitor_excecao_notificacoes(p_desde);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_monitor_excecao_notificacoes(timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_monitor_excecao_notificacoes(timestamptz, uuid) TO authenticated;
