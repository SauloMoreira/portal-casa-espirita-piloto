
CREATE OR REPLACE FUNCTION public.fn_provisionar_acesso_assistido(
  p_operador_id uuid,
  p_novo_user_id uuid,
  p_assistido_id uuid,
  p_email text,
  p_celular text,
  p_data_nascimento date
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_assistido public.assistidos%ROWTYPE;
  v_papel text;
  v_has_global boolean;
BEGIN
  IF p_operador_id IS NULL OR p_novo_user_id IS NULL OR p_assistido_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_OBRIGATORIOS_AUSENTES';
  END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'EMAIL_OBRIGATORIO';
  END IF;
  IF p_celular IS NULL OR btrim(p_celular) = '' THEN
    RAISE EXCEPTION 'CELULAR_OBRIGATORIO';
  END IF;
  IF p_data_nascimento IS NULL THEN
    RAISE EXCEPTION 'DATA_NASCIMENTO_OBRIGATORIA';
  END IF;

  -- Lock do assistido alvo
  SELECT * INTO v_assistido
  FROM public.assistidos
  WHERE id = p_assistido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSISTIDO_NAO_ENCONTRADO';
  END IF;
  IF v_assistido.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'ASSISTIDO_EXCLUIDO';
  END IF;
  IF v_assistido.instituicao_id IS NULL THEN
    RAISE EXCEPTION 'ASSISTIDO_SEM_INSTITUICAO';
  END IF;
  IF v_assistido.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'ASSISTIDO_JA_VINCULADO';
  END IF;

  -- Autorização do operador: vínculo local ativo no MESMO tenant
  SELECT papel_local::text INTO v_papel
  FROM public.instituicao_usuarios
  WHERE user_id = p_operador_id
    AND instituicao_id = v_assistido.instituicao_id
    AND status = 'ativo'::saas_vinculo_status
  ORDER BY CASE papel_local::text
    WHEN 'admin_instituicao' THEN 1
    WHEN 'entrevistador' THEN 2
    ELSE 9 END
  LIMIT 1;

  IF v_papel IS NULL OR v_papel NOT IN ('admin_instituicao','entrevistador') THEN
    RAISE EXCEPTION 'CROSS_TENANT_ACCESS_DENIED';
  END IF;

  -- Papel global correspondente
  IF v_papel = 'admin_instituicao' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_operador_id AND role = 'admin'
    ) INTO v_has_global;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_operador_id AND role IN ('admin','entrevistador')
    ) INTO v_has_global;
  END IF;
  IF NOT v_has_global THEN
    RAISE EXCEPTION 'OPERADOR_SEM_PAPEL_GLOBAL';
  END IF;

  -- Novo user precisa estar totalmente virgem
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_novo_user_id) THEN
    RAISE EXCEPTION 'NOVO_USER_JA_POSSUI_PROFILE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_novo_user_id) THEN
    RAISE EXCEPTION 'NOVO_USER_JA_POSSUI_ROLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.instituicao_usuarios WHERE user_id = p_novo_user_id) THEN
    RAISE EXCEPTION 'NOVO_USER_JA_POSSUI_VINCULO';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assistidos WHERE user_id = p_novo_user_id) THEN
    RAISE EXCEPTION 'NOVO_USER_JA_VINCULADO_ASSISTIDO';
  END IF;

  -- Persistência atômica
  INSERT INTO public.profiles (user_id, nome_completo, celular, created_by, status)
  VALUES (p_novo_user_id, v_assistido.nome, p_celular, p_operador_id, 'ativo');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_novo_user_id, 'assistido');

  INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
  VALUES (
    v_assistido.instituicao_id,
    p_novo_user_id,
    'assistido'::saas_papel_local,
    'ativo'::saas_vinculo_status
  );

  UPDATE public.assistidos
     SET user_id = p_novo_user_id,
         email = p_email,
         celular = p_celular,
         telefone = COALESCE(NULLIF(regexp_replace(coalesce(telefone,''), '\D', '', 'g'), ''), p_celular),
         data_nascimento = p_data_nascimento
   WHERE id = p_assistido_id
     AND user_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSISTIDO_UPDATE_FALHOU';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_novo_user_id,
    'assistido_id', p_assistido_id,
    'instituicao_id', v_assistido.instituicao_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_provisionar_acesso_assistido(uuid,uuid,uuid,text,text,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_provisionar_acesso_assistido(uuid,uuid,uuid,text,text,date) FROM anon;
REVOKE ALL ON FUNCTION public.fn_provisionar_acesso_assistido(uuid,uuid,uuid,text,text,date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_provisionar_acesso_assistido(uuid,uuid,uuid,text,text,date) TO service_role;

COMMENT ON FUNCTION public.fn_provisionar_acesso_assistido(uuid,uuid,uuid,text,text,date)
IS 'STAB10-A: provisionamento tenant-aware do acesso do assistido. Somente service_role.';
