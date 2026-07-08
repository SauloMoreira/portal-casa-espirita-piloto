
-- SAAS-05-E3 — RPCs tenant-aware de Entrevistas e Avisos de Ausência (lote 3).
-- Padrão SAAS-05-E1/E2: novo overload com p_instituicao_id obrigatório,
-- validação (NOT NULL → auth → membership OU platform_admin → pertinência
-- do recurso via assistidos T-DIR → SET LOCAL) e delega para a assinatura
-- legada. Assinaturas legadas preservadas (backward-compat; cutover em
-- SAAS-05-F). Nenhuma alteração em RLS, policies, NOT NULL, tabelas
-- T-DIR/T-HER, edge functions, dispatcher ou projeto FER original.

-- 1) agendar_entrevista_fraterna (recurso: assistidos T-DIR)
CREATE OR REPLACE FUNCTION public.agendar_entrevista_fraterna(
  _assistido_id uuid,
  _data timestamptz,
  _tipo text,
  _observacoes text,
  p_instituicao_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  IF _assistido_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assistidos a
    WHERE a.id = _assistido_id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Assistido não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.agendar_entrevista_fraterna(_assistido_id, _data, _tipo, _observacoes);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.agendar_entrevista_fraterna(uuid, timestamptz, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_entrevista_fraterna(uuid, timestamptz, text, text, uuid) TO authenticated;

-- 2) fn_entrevistas_operacional (recurso: entrevistas_fraternas → assistidos)
CREATE OR REPLACE FUNCTION public.fn_entrevistas_operacional(
  _start timestamptz,
  _end   timestamptz,
  _id    uuid,
  p_instituicao_id uuid
) RETURNS TABLE (
  id uuid,
  assistido_id uuid,
  entrevistador_id uuid,
  data timestamptz,
  tipo_entrevista text,
  status text
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
  IF _id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.entrevistas_fraternas e
    JOIN public.assistidos a ON a.id = e.assistido_id
    WHERE e.id = _id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Entrevista não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN QUERY
    SELECT e.id, e.assistido_id, e.entrevistador_id, e.data, e.tipo_entrevista, e.status
    FROM public.entrevistas_fraternas e
    JOIN public.assistidos a ON a.id = e.assistido_id
    WHERE (
      public.has_role(v_uid, 'admin'::app_role)
      OR public.has_role(v_uid, 'entrevistador'::app_role)
      OR public.has_role(v_uid, 'tarefeiro'::app_role)
    )
    AND (_id IS NULL OR e.id = _id)
    AND (_start IS NULL OR e.data >= _start)
    AND (_end IS NULL OR e.data <= _end)
    AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    ORDER BY e.data ASC;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_entrevistas_operacional(timestamptz, timestamptz, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entrevistas_operacional(timestamptz, timestamptz, uuid, uuid) TO authenticated;

-- 3) fn_registrar_aviso_ausencia (recurso: assistidos do próprio usuário)
CREATE OR REPLACE FUNCTION public.fn_registrar_aviso_ausencia(
  p_tipo_compromisso text,
  p_compromisso_id uuid,
  p_motivo text,
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
  IF EXISTS (
    SELECT 1 FROM public.assistidos a
    WHERE a.user_id = v_uid
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Assistido não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.fn_registrar_aviso_ausencia(p_tipo_compromisso, p_compromisso_id, p_motivo);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_registrar_aviso_ausencia(text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_aviso_ausencia(text, uuid, text, uuid) TO authenticated;

-- 4) fn_tratar_aviso_ausencia (recurso: avisos_ausencia → assistidos)
CREATE OR REPLACE FUNCTION public.fn_tratar_aviso_ausencia(
  p_aviso_id uuid,
  p_novo_status text,
  p_resolucao text,
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
  IF p_aviso_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.avisos_ausencia av
    JOIN public.assistidos a ON a.id = av.assistido_id
    WHERE av.id = p_aviso_id
      AND a.instituicao_id IS NOT NULL
      AND a.instituicao_id <> p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'Aviso não pertence à instituição informada.'
      USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
  RETURN public.fn_tratar_aviso_ausencia(p_aviso_id, p_novo_status, p_resolucao);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_tratar_aviso_ausencia(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tratar_aviso_ausencia(uuid, text, text, uuid) TO authenticated;

-- 5) fn_avisos_ausencia_pendentes (recurso: avisos_ausencia → assistidos)
CREATE OR REPLACE FUNCTION public.fn_avisos_ausencia_pendentes(
  p_incluir_resolvidos boolean,
  p_instituicao_id uuid
) RETURNS TABLE(
  id uuid,
  assistido_id uuid,
  assistido_nome text,
  tipo_compromisso text,
  data_compromisso date,
  status text,
  tratado_por uuid,
  tratado_em timestamptz,
  created_at timestamptz,
  motivo text,
  resolucao text,
  pode_ver_conteudo boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_autorizado boolean;
  v_tarefeiro boolean;
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

  v_autorizado := public.has_role(v_uid, 'admin')
    OR public.has_role(v_uid, 'administrador_master')
    OR public.has_role(v_uid, 'coordenador_de_tratamento')
    OR public.has_role(v_uid, 'entrevistador');
  v_tarefeiro := public.has_role(v_uid, 'tarefeiro');

  IF NOT (v_autorizado OR v_tarefeiro) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      av.id,
      av.assistido_id,
      a.nome AS assistido_nome,
      av.tipo_compromisso,
      av.data_compromisso,
      av.status,
      av.tratado_por,
      av.tratado_em,
      av.created_at,
      CASE WHEN v_autorizado THEN av.motivo ELSE NULL END AS motivo,
      CASE WHEN v_autorizado THEN av.resolucao ELSE NULL END AS resolucao,
      v_autorizado AS pode_ver_conteudo
    FROM public.avisos_ausencia av
    JOIN public.assistidos a ON a.id = av.assistido_id
    WHERE (p_incluir_resolvidos OR av.status IN ('aberto','em_tratamento'))
      AND (a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id)
    ORDER BY av.created_at DESC;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_avisos_ausencia_pendentes(boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_avisos_ausencia_pendentes(boolean, uuid) TO authenticated;
