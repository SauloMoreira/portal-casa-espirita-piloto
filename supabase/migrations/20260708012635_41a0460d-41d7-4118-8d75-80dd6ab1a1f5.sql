-- SAAS-05-E-EDGE-A2 — Overloads tenant-aware para fila humana e comunicadores elegíveis.
-- Preserva assinaturas legadas (backward-compat até cutover SAAS-05-F).
-- Padrão E1: p_instituicao_id NOT NULL, auth (quando autenticado) valida
-- is_platform_admin OR is_member_of_instituicao, filtro explícito por tenant.
-- SECURITY DEFINER com search_path fixo. REVOKE PUBLIC/anon; GRANT authenticated
-- e service_role (chamada por edge function via service_role).

-- 1) fila_humana_pendente(p_instituicao_id uuid)
-- Tenant do handoff resolvido via: handoff.conversa_id -> whatsapp_conversas.assistido_id
-- -> assistidos.instituicao_id. Handoffs sem assistido vinculado são excluídos
-- (fail-closed: não podem ser atribuídos a um tenant com segurança).
CREATE OR REPLACE FUNCTION public.fila_humana_pendente(p_instituicao_id uuid)
RETURNS TABLE(total_pendentes integer, idade_mais_antiga_min integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE = '22023';
  END IF;

  -- Contexto autenticado: validar membership ou platform_admin.
  -- Contexto service_role (edge function/cron): auth.uid() = NULL, permitido.
  IF v_uid IS NOT NULL THEN
    IF NOT (public.is_platform_admin(v_uid)
            OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
      RAISE EXCEPTION 'Acesso negado à instituição informada'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);

  RETURN QUERY
  SELECT
    COUNT(*)::int AS total_pendentes,
    COALESCE(MAX(EXTRACT(EPOCH FROM (now() - h.opened_at)) / 60)::int, 0)
      AS idade_mais_antiga_min
  FROM public.whatsapp_handoffs h
  JOIN public.whatsapp_conversas c ON c.id = h.conversa_id
  JOIN public.assistidos a ON a.id = c.assistido_id
  WHERE h.status = 'aberto'
    AND h.atendente_id IS NULL
    AND a.instituicao_id = p_instituicao_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fila_humana_pendente(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fila_humana_pendente(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fila_humana_pendente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fila_humana_pendente(uuid) TO service_role;

COMMENT ON FUNCTION public.fila_humana_pendente(uuid) IS
  'SAAS-05-E-EDGE-A2: overload tenant-aware. Handoffs sem assistido vinculado são excluídos (fail-closed). Legado sem parâmetro preservado para compat até SAAS-05-F.';

-- 2) comunicadores_elegiveis(p_instituicao_id uuid)
-- Restringe voluntarios ao tenant informado via v.instituicao_id.
CREATE OR REPLACE FUNCTION public.comunicadores_elegiveis(p_instituicao_id uuid)
RETURNS TABLE(user_id uuid, celular text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NOT NULL THEN
    IF NOT (public.is_platform_admin(v_uid)
            OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
      RAISE EXCEPTION 'Acesso negado à instituição informada'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);

  RETURN QUERY
  WITH comunicadores AS (
    SELECT public.fn_normalize_phone(v.celular) AS tel
    FROM public.voluntarios v
    JOIN public.voluntario_funcoes vf ON vf.voluntario_id = v.id
    JOIN public.funcoes_voluntariado f ON f.id = vf.funcao_id
    WHERE v.status = 'ativo'
      AND v.instituicao_id = p_instituicao_id
      AND lower(trim(f.nome_funcao)) = 'comunicador'
      AND public.fn_normalize_phone(v.celular) IS NOT NULL
  ),
  tel_unico_vol AS (
    SELECT tel FROM comunicadores GROUP BY tel HAVING COUNT(*) = 1
  ),
  perfis AS (
    SELECT p.user_id, p.celular, public.fn_normalize_phone(p.celular) AS tel
    FROM public.profiles p
    WHERE public.fn_normalize_phone(p.celular) IS NOT NULL
  ),
  tel_unico_perfil AS (
    SELECT tel FROM perfis GROUP BY tel HAVING COUNT(*) = 1
  )
  SELECT DISTINCT pf.user_id, pf.celular
  FROM tel_unico_vol uv
  JOIN tel_unico_perfil up ON up.tel = uv.tel
  JOIN perfis pf ON pf.tel = uv.tel
  JOIN public.comunicador_alerta_config cfg ON cfg.user_id = pf.user_id
  WHERE cfg.recebe_alertas_central = true
    AND cfg.ativo = true;
END;
$function$;

REVOKE ALL ON FUNCTION public.comunicadores_elegiveis(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comunicadores_elegiveis(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.comunicadores_elegiveis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.comunicadores_elegiveis(uuid) TO service_role;

COMMENT ON FUNCTION public.comunicadores_elegiveis(uuid) IS
  'SAAS-05-E-EDGE-A2: overload tenant-aware. Filtro por voluntarios.instituicao_id. Legado sem parâmetro preservado para compat até SAAS-05-F.';