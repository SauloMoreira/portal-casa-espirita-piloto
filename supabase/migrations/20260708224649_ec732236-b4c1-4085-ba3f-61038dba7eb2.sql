
-- SAAS-06-B0.6 — Vinculação do administrador inicial da instituição
-- RPCs SECURITY DEFINER para platform_admin gerenciar vínculos em instituicao_usuarios
-- via e-mail, sem expor auth.users ao cliente.

CREATE OR REPLACE FUNCTION public.fn_listar_vinculos_instituicao(p_instituicao_id uuid)
RETURNS TABLE (
  vinculo_id uuid,
  user_id uuid,
  email text,
  nome_completo text,
  papel_local saas_papel_local,
  status saas_vinculo_status,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (public.is_platform_admin(auth.uid())
          OR public.user_is_admin_instituicao(auth.uid(), p_instituicao_id)) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT iu.id, iu.user_id, u.email::text, p.nome_completo,
           iu.papel_local, iu.status, iu.created_at, iu.updated_at
      FROM public.instituicao_usuarios iu
      LEFT JOIN auth.users u ON u.id = iu.user_id
      LEFT JOIN public.profiles p ON p.user_id = iu.user_id
     WHERE iu.instituicao_id = p_instituicao_id
     ORDER BY iu.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_listar_vinculos_instituicao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_listar_vinculos_instituicao(uuid) TO authenticated;

-- Vincula um usuário (por e-mail) a uma instituição.
-- Regras:
--  - Somente platform_admin pode conceder o papel 'admin_instituicao'
--    (impede autopromoção de admin local em outra instituição).
--  - admin_instituicao já existente pode gerenciar demais papéis locais na
--    sua própria instituição (coordenador, entrevistador, tarefeiro, etc.).
--  - Se o e-mail não existir em auth.users, retorna status='nao_encontrado'
--    para que o platform_admin oriente o convite via /cadastro.
CREATE OR REPLACE FUNCTION public.fn_vincular_usuario_instituicao(
  p_instituicao_id uuid,
  p_email text,
  p_papel_local saas_papel_local DEFAULT 'admin_instituicao',
  p_status saas_vinculo_status DEFAULT 'ativo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_platform boolean := public.is_platform_admin(v_caller);
  v_is_admin_local boolean := public.user_tem_papel_local(v_caller, p_instituicao_id, 'admin_instituicao');
  v_email text := lower(btrim(p_email));
  v_user_id uuid;
  v_vinculo_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'autenticacao requerida' USING ERRCODE = '42501';
  END IF;

  IF NOT (v_is_platform OR v_is_admin_local) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  IF p_papel_local = 'admin_instituicao' AND NOT v_is_platform THEN
    RAISE EXCEPTION 'apenas platform_admin pode conceder admin_instituicao'
      USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'e-mail invalido' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'nao_encontrado',
      'message', 'Usuário não encontrado. Peça para se cadastrar em /cadastro antes de vincular.'
    );
  END IF;

  INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
       VALUES (p_instituicao_id, v_user_id, p_papel_local, p_status)
  ON CONFLICT (instituicao_id, user_id, papel_local)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now()
  RETURNING id INTO v_vinculo_id;

  INSERT INTO public.audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (
    v_caller, 'instituicao_usuarios', 'VINCULAR_USUARIO', v_vinculo_id,
    jsonb_build_object(
      'instituicao_id', p_instituicao_id,
      'user_id', v_user_id,
      'email', v_email,
      'papel_local', p_papel_local,
      'status', p_status
    )
  );

  RETURN jsonb_build_object(
    'status', 'ok',
    'vinculo_id', v_vinculo_id,
    'user_id', v_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_vincular_usuario_instituicao(uuid, text, saas_papel_local, saas_vinculo_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vincular_usuario_instituicao(uuid, text, saas_papel_local, saas_vinculo_status) TO authenticated;

-- Alterna status (ativo/inativo) de um vínculo existente.
CREATE OR REPLACE FUNCTION public.fn_definir_status_vinculo_instituicao(
  p_vinculo_id uuid,
  p_status saas_vinculo_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_inst uuid;
  v_papel saas_papel_local;
BEGIN
  SELECT instituicao_id, papel_local INTO v_inst, v_papel
    FROM public.instituicao_usuarios WHERE id = p_vinculo_id;

  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'vinculo nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_platform_admin(v_caller)
          OR public.user_tem_papel_local(v_caller, v_inst, 'admin_instituicao')) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  -- admin local não pode desativar um admin_instituicao (evita se remover)
  IF v_papel = 'admin_instituicao' AND NOT public.is_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'apenas platform_admin pode alterar admin_instituicao'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.instituicao_usuarios
     SET status = p_status, updated_at = now()
   WHERE id = p_vinculo_id;

  INSERT INTO public.audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (v_caller, 'instituicao_usuarios', 'ALTERAR_STATUS_VINCULO', p_vinculo_id,
          jsonb_build_object('novo_status', p_status));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_definir_status_vinculo_instituicao(uuid, saas_vinculo_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_definir_status_vinculo_instituicao(uuid, saas_vinculo_status) TO authenticated;

-- Índice de unicidade para permitir ON CONFLICT no vínculo (uma linha por papel/usuário/instituição).
CREATE UNIQUE INDEX IF NOT EXISTS instituicao_usuarios_inst_user_papel_uidx
  ON public.instituicao_usuarios (instituicao_id, user_id, papel_local);
