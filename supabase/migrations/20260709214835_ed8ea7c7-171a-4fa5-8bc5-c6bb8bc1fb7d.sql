-- SAAS-06-C1-FIX06: garantir vínculo institucional ativo ao conceder acesso operacional.
-- Substitui fn_conceder_acesso_operacional adicionando p_instituicao_id (default NULL),
-- garantindo criação/reativação idempotente de vínculo em instituicao_usuarios e auditoria.

-- 1) DROP + CREATE (nova assinatura com p_instituicao_id).
DROP FUNCTION IF EXISTS public.fn_conceder_acesso_operacional(uuid, app_role, text);

CREATE OR REPLACE FUNCTION public.fn_conceder_acesso_operacional(
  p_target_user_id uuid,
  p_role app_role,
  p_motivo text DEFAULT NULL,
  p_instituicao_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_inst uuid := p_instituicao_id;
  v_is_platform_admin boolean := false;
  v_papel_local saas_papel_local;
  v_role_inserted boolean := false;
  v_vinculo_status text := 'inalterado';
  v_prev_status saas_vinculo_status;
BEGIN
  IF NOT public.is_active_admin(v_caller) THEN
    RETURN jsonb_build_object('error', 'Apenas administradores ativos podem conceder acessos operacionais.');
  END IF;

  IF p_role NOT IN ('entrevistador','tarefeiro','coordenador_de_tratamento') THEN
    IF p_role = 'assistido' THEN
      RETURN jsonb_build_object('error', 'Assistido é o papel base automático e não é gerenciado na Gestão de Acesso.');
    ELSIF p_role IN ('admin','administrador_master') THEN
      RETURN jsonb_build_object('error', 'Acessos administrativos são concedidos apenas pelo fluxo de aprovação reforçado.');
    ELSE
      RETURN jsonb_build_object('error', 'Papel operacional inválido.');
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_target_user_id) THEN
    RETURN jsonb_build_object('error', 'Usuário não encontrado.');
  END IF;

  -- Resolver tenant. Fallback: GUC app.current_instituicao (compat com callers legados).
  IF v_inst IS NULL THEN
    v_inst := public.current_instituicao_id();
  END IF;

  v_is_platform_admin := EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = v_caller
  );

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object('error', 'Selecione uma instituição antes de conceder acesso.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.instituicoes WHERE id = v_inst) THEN
    RETURN jsonb_build_object('error', 'Instituição não encontrada.');
  END IF;

  -- Autoridade sobre o tenant: platform_admin OU admin_instituicao ativo.
  IF NOT v_is_platform_admin
     AND NOT public.fn_is_admin_instituicao(v_caller, v_inst) THEN
    RETURN jsonb_build_object('error', 'Você não é administrador desta instituição.');
  END IF;

  -- Mapeia app_role → saas_papel_local.
  v_papel_local := CASE p_role
    WHEN 'entrevistador' THEN 'entrevistador'::saas_papel_local
    WHEN 'tarefeiro' THEN 'tarefeiro'::saas_papel_local
    WHEN 'coordenador_de_tratamento' THEN 'coordenador'::saas_papel_local
  END;

  -- Vínculo institucional idempotente (upsert com reativação).
  SELECT status INTO v_prev_status
  FROM public.instituicao_usuarios
  WHERE instituicao_id = v_inst
    AND user_id = p_target_user_id
    AND papel_local = v_papel_local;

  IF v_prev_status IS NULL THEN
    INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
    VALUES (v_inst, p_target_user_id, v_papel_local, 'ativo');
    v_vinculo_status := 'criado';

    INSERT INTO public.audit_logs (user_id, tabela, acao, registro_id, dados_novos)
    VALUES (v_caller, 'instituicao_usuarios', 'VINCULO_INSTITUCIONAL_CRIADO', p_target_user_id,
      jsonb_build_object('instituicao_id', v_inst, 'papel_local', v_papel_local, 'origem', 'FIX06'));
  ELSIF v_prev_status <> 'ativo' THEN
    UPDATE public.instituicao_usuarios
      SET status = 'ativo', updated_at = now()
      WHERE instituicao_id = v_inst
        AND user_id = p_target_user_id
        AND papel_local = v_papel_local;
    v_vinculo_status := 'reativado';

    INSERT INTO public.audit_logs (user_id, tabela, acao, registro_id, dados_novos)
    VALUES (v_caller, 'instituicao_usuarios', 'VINCULO_INSTITUCIONAL_REATIVADO', p_target_user_id,
      jsonb_build_object('instituicao_id', v_inst, 'papel_local', v_papel_local, 'status_anterior', v_prev_status, 'origem', 'FIX06'));
  END IF;

  -- Papel operacional em user_roles (idempotente).
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_target_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  GET DIAGNOSTICS v_role_inserted = ROW_COUNT;

  IF v_role_inserted THEN
    INSERT INTO public.audit_logs (user_id, tabela, acao, registro_id, dados_novos)
    VALUES (v_caller, 'user_roles', 'ACESSO_OPERACIONAL_CONCEDIDO', p_target_user_id,
      jsonb_build_object('target_user_id', p_target_user_id, 'role', p_role, 'motivo', p_motivo,
                         'instituicao_id', v_inst, 'vinculo', v_vinculo_status));
    RETURN jsonb_build_object('success', true, 'status', 'concedido', 'role', p_role,
                              'instituicao_id', v_inst, 'vinculo', v_vinculo_status);
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'ja_concedido', 'role', p_role,
                            'instituicao_id', v_inst, 'vinculo', v_vinculo_status);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_conceder_acesso_operacional(uuid, app_role, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conceder_acesso_operacional(uuid, app_role, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_conceder_acesso_operacional(uuid, app_role, text, uuid) IS
  'SAAS-06-C1-FIX06: concede acesso operacional garantindo vínculo institucional ativo (instituicao_usuarios) de forma idempotente. Requer platform_admin ou admin_instituicao do tenant alvo.';

-- 2) Correção idempotente do caso piloto: Tarefeiro Teste (dcb487e2-0ec2-4dee-9cc4-0adccdbb9121)
--    na instituição Tratamentos FER (e3818702-cfac-47ae-b751-cb6a05babd4f).
INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
VALUES ('e3818702-cfac-47ae-b751-cb6a05babd4f', 'dcb487e2-0ec2-4dee-9cc4-0adccdbb9121', 'tarefeiro', 'ativo')
ON CONFLICT (instituicao_id, user_id, papel_local)
DO UPDATE SET status = 'ativo', updated_at = now();

INSERT INTO public.audit_logs (user_id, tabela, acao, registro_id, dados_novos)
VALUES (
  'dcb487e2-0ec2-4dee-9cc4-0adccdbb9121',
  'instituicao_usuarios',
  'VINCULO_INSTITUCIONAL_CRIADO',
  'dcb487e2-0ec2-4dee-9cc4-0adccdbb9121',
  jsonb_build_object(
    'instituicao_id', 'e3818702-cfac-47ae-b751-cb6a05babd4f',
    'papel_local', 'tarefeiro',
    'origem', 'FIX06-backfill-tarefeiro-teste'
  )
);