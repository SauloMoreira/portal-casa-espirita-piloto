
-- SAAS-05-E2 — RPCs tenant-aware do núcleo Assistidos/Agenda/Tratamentos (lote 2).
-- Padrão idêntico ao SAAS-05-E1: novo overload com p_instituicao_id obrigatório,
-- validação (NOT NULL → auth → membership OU platform_admin → pertinência do
-- recurso via join com T-DIR pai → SET LOCAL) e delega para assinatura legada.
-- Assinaturas legadas preservadas (backward-compat; cutover em SAAS-05-F).

-- ============================================================
-- 1) pts_registrar_presenca (recurso: assistido_tratamentos → assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.pts_registrar_presenca(
  p_vinculo_id uuid,
  p_data date,
  p_registrado_por uuid,
  p_proxima_numero_etapa integer,
  p_proxima_data date,
  p_proxima_horario time without time zone,
  p_instituicao_id uuid
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
  IF p_vinculo_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assistido_tratamentos at
    JOIN public.assistidos a ON a.id = at.assistido_id
    WHERE at.id = p_vinculo_id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Vínculo não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.pts_registrar_presenca(
    p_vinculo_id, p_data, p_registrado_por,
    p_proxima_numero_etapa, p_proxima_data, p_proxima_horario
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.pts_registrar_presenca(uuid, date, uuid, integer, date, time without time zone, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_registrar_presenca(uuid, date, uuid, integer, date, time without time zone, uuid) TO authenticated;

-- ============================================================
-- 2) pts_registrar_ausencia (recurso: assistido_tratamentos → assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.pts_registrar_ausencia(
  p_vinculo_id uuid,
  p_data date,
  p_registrado_por uuid,
  p_nova_data date,
  p_nova_horario time without time zone,
  p_instituicao_id uuid
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
  IF p_vinculo_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assistido_tratamentos at
    JOIN public.assistidos a ON a.id = at.assistido_id
    WHERE at.id = p_vinculo_id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Vínculo não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.pts_registrar_ausencia(
    p_vinculo_id, p_data, p_registrado_por, p_nova_data, p_nova_horario
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.pts_registrar_ausencia(uuid, date, uuid, date, time without time zone, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_registrar_ausencia(uuid, date, uuid, date, time without time zone, uuid) TO authenticated;

-- ============================================================
-- 3) pts_rollback_piloto (recurso: assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.pts_rollback_piloto(
  p_assistido_id uuid,
  p_instituicao_id uuid
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
  IF p_assistido_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assistidos a
    WHERE a.id = p_assistido_id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Assistido não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.pts_rollback_piloto(p_assistido_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.pts_rollback_piloto(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_rollback_piloto(uuid, uuid) TO authenticated;

-- ============================================================
-- 4) pts_homologacao_auditar (recurso: assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.pts_homologacao_auditar(
  p_assistido_id uuid,
  p_acao text,
  p_resultado jsonb,
  p_instituicao_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  IF p_assistido_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assistidos a
    WHERE a.id = p_assistido_id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Assistido não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  PERFORM public.pts_homologacao_auditar(p_assistido_id, p_acao, p_resultado);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.pts_homologacao_auditar(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_homologacao_auditar(uuid, text, jsonb, uuid) TO authenticated;

-- ============================================================
-- 5) pts_converter_assistido (recurso: assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.pts_converter_assistido(
  p_assistido_id uuid,
  p_planos jsonb,
  p_instituicao_id uuid
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
  IF p_assistido_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assistidos a
    WHERE a.id = p_assistido_id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Assistido não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.pts_converter_assistido(p_assistido_id, p_planos);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.pts_converter_assistido(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_converter_assistido(uuid, jsonb, uuid) TO authenticated;

-- ============================================================
-- 6) pts_persistir_plano (recurso: assistido_tratamentos → assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.pts_persistir_plano(
  p_vinculo_id uuid,
  p_etapas jsonb,
  p_sessao_ativa jsonb,
  p_instituicao_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  IF p_vinculo_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assistido_tratamentos at
    JOIN public.assistidos a ON a.id = at.assistido_id
    WHERE at.id = p_vinculo_id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Vínculo não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  PERFORM public.pts_persistir_plano(p_vinculo_id, p_etapas, p_sessao_ativa);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.pts_persistir_plano(uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_persistir_plano(uuid, jsonb, jsonb, uuid) TO authenticated;

-- ============================================================
-- 7) registrar_presenca (legado; recurso: assistido_tratamentos → assistidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.registrar_presenca(
  p_assistido_tratamento_id uuid,
  p_data date,
  p_status_presenca text,
  p_registrado_por uuid,
  p_observacao text,
  p_instituicao_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  IF p_assistido_tratamento_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assistido_tratamentos at
    JOIN public.assistidos a ON a.id = at.assistido_id
    WHERE at.id = p_assistido_tratamento_id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Vínculo não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  PERFORM public.registrar_presenca(
    p_assistido_tratamento_id, p_data, p_status_presenca, p_registrado_por, p_observacao
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.registrar_presenca(uuid, date, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_presenca(uuid, date, text, uuid, text, uuid) TO authenticated;
