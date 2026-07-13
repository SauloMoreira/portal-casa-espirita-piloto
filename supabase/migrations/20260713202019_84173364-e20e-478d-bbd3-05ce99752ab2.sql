CREATE OR REPLACE FUNCTION public.fn_autocadastro_assistido_publico(
  p_request_id uuid, p_idempotency_key uuid, p_request_fingerprint text,
  p_instituicao_id uuid, p_user_id uuid, p_email_normalizado text,
  p_nome_completo text, p_cpf_normalizado text, p_celular_normalizado text,
  p_termos_versao text, p_privacidade_versao text, p_aceito_em timestamptz)
RETURNS TABLE(result_code text, assistido_id uuid, instituicao_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
#variable_conflict use_column
DECLARE
  v_row public.autocadastro_idempotencia%ROWTYPE;
  v_inst public.instituicoes%ROWTYPE;
  v_auth_email text;
  v_assistido_id uuid;
  v_rows integer;
BEGIN
  IF p_request_id IS NULL OR p_idempotency_key IS NULL
     OR p_request_fingerprint IS NULL OR btrim(p_request_fingerprint) = ''
     OR p_instituicao_id IS NULL OR p_user_id IS NULL
     OR p_email_normalizado IS NULL OR btrim(p_email_normalizado) = ''
     OR p_nome_completo IS NULL OR btrim(p_nome_completo) = ''
     OR p_celular_normalizado IS NULL OR btrim(p_celular_normalizado) = ''
     OR p_termos_versao IS NULL OR p_privacidade_versao IS NULL
     OR p_aceito_em IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_INVALIDOS';
  END IF;

  SELECT * INTO v_row
    FROM public.autocadastro_idempotencia
   WHERE idempotency_key = p_idempotency_key
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IDEMPOTENCIA_INEXISTENTE'; END IF;

  IF v_row.request_fingerprint <> p_request_fingerprint THEN
    RAISE EXCEPTION 'FINGERPRINT_DIVERGENTE'; END IF;
  IF v_row.request_id <> p_request_id THEN
    RAISE EXCEPTION 'REQUEST_ID_DIVERGENTE'; END IF;
  IF v_row.instituicao_id <> p_instituicao_id THEN
    RAISE EXCEPTION 'INSTITUICAO_DIVERGENTE'; END IF;

  IF v_row.status = 'concluido' THEN
    IF v_row.user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'USER_ID_DIVERGENTE'; END IF;
    RETURN QUERY SELECT 'SUCESSO'::text, v_row.assistido_id, v_row.instituicao_id;
    RETURN;
  END IF;

  IF v_row.status <> 'auth_criado' THEN
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_AUTH_CRIADO_CONCLUIDO (origem=%)', v_row.status; END IF;

  IF v_row.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'USER_ID_DIVERGENTE'; END IF;

  SELECT * INTO v_inst
    FROM public.instituicoes i
   WHERE i.id = p_instituicao_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSTITUICAO_INEXISTENTE'; END IF;
  IF v_inst.status NOT IN ('ativa','implantacao') OR NOT v_inst.autocadastro_habilitado THEN
    RAISE EXCEPTION 'INSTITUICAO_NAO_ELEGIVEL';
  END IF;

  SELECT lower(email) INTO v_auth_email FROM auth.users WHERE id = p_user_id;
  IF v_auth_email IS NULL THEN RAISE EXCEPTION 'AUTH_USER_INEXISTENTE'; END IF;
  IF v_auth_email <> lower(p_email_normalizado) THEN
    RAISE EXCEPTION 'AUTH_EMAIL_DIVERGENTE';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_user_id) THEN
    RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.instituicao_usuarios iu
     WHERE iu.user_id = p_user_id AND iu.ativo = true
  ) THEN
    RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.assistidos a
     WHERE a.user_id = p_user_id AND a.instituicao_id = p_instituicao_id
       AND a.ativo = true
  ) THEN
    RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE';
  END IF;

  BEGIN
    INSERT INTO public.profiles (user_id, nome_completo, email, celular, tipo_perfil, ativo)
    VALUES (p_user_id, p_nome_completo, p_email_normalizado, p_celular_normalizado, 'assistido', true);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'assistido')
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.instituicao_usuarios (user_id, instituicao_id, papel_institucional, ativo)
    VALUES (p_user_id, p_instituicao_id, 'assistido', true);

    INSERT INTO public.assistidos
      (user_id, instituicao_id, nome, email, celular, cpf, created_by, ativo)
    VALUES
      (p_user_id, p_instituicao_id, p_nome_completo, p_email_normalizado,
       p_celular_normalizado, NULLIF(p_cpf_normalizado,''), p_user_id, true)
    RETURNING id INTO v_assistido_id;

    INSERT INTO public.consentimentos_comunicacao
      (user_id, canal, aceito, versao_termo, aceito_em)
    VALUES (p_user_id, 'whatsapp', true, p_termos_versao, p_aceito_em)
    ON CONFLICT (user_id, canal) DO UPDATE
      SET aceito = EXCLUDED.aceito,
          versao_termo = EXCLUDED.versao_termo,
          aceito_em = EXCLUDED.aceito_em;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE';
  END;

  INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
  VALUES (
    p_user_id,
    'AUTOCADASTRO_ASSISTIDO_PUBLICO',
    'assistidos',
    v_assistido_id,
    jsonb_build_object(
      'request_id', p_request_id,
      'idempotency_key', p_idempotency_key,
      'instituicao_id', p_instituicao_id,
      'termos_versao', p_termos_versao,
      'privacidade_versao', p_privacidade_versao
    )
  );

  UPDATE public.autocadastro_idempotencia
     SET status = 'concluido',
         assistido_id = v_assistido_id,
         result_code = 'SUCESSO',
         updated_at = clock_timestamp()
   WHERE idempotency_key = p_idempotency_key
     AND status = 'auth_criado';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_AUTH_CRIADO_CONCLUIDO (linha alterada por outra transação)';
  END IF;

  RETURN QUERY SELECT 'SUCESSO'::text, v_assistido_id, p_instituicao_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_autocadastro_assistido_publico(
  uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_autocadastro_assistido_publico(
  uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.fn_autocadastro_assistido_publico(
  uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_autocadastro_assistido_publico(
  uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, timestamptz
) TO service_role;