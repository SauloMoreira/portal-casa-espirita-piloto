-- Rollback: SAAS-06-C1-STAB10-C1.2-A1 (hardening base)
-- Executar APÓS aplicar rollback-stab10-c12a-fix01.sql.
-- Restaura as quatro RPCs C1.2-A EFETIVAS (incluindo as correções de
-- clock_timestamp e #variable_conflict use_column) e remove o índice
-- único parcial introduzido pelo A1.
--
-- Executar em transação única, em janela de manutenção.

BEGIN;

-- 1) Remover o índice A1 (a versão C1.2-A não possui esse índice).
DROP INDEX IF EXISTS public.ux_autocadastro_idem_user_ativo;

-- 2) Recriar fn_autocadastro_reservar na assinatura C1.2-A (5 args, retorno de 4 colunas).
--    O A1 adicionou canonical_request_id e alterou o corpo; aqui restauramos ambos.
DROP FUNCTION IF EXISTS public.fn_autocadastro_reservar(uuid, text, uuid, uuid, timestamptz);

CREATE FUNCTION public.fn_autocadastro_reservar(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_request_id uuid,
  p_instituicao_id uuid,
  p_expires_at timestamptz
)
RETURNS TABLE (
  result_code text,
  user_id uuid,
  assistido_id uuid,
  instituicao_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $fn$
DECLARE
  v_inserted_key uuid;
  v_row public.autocadastro_idempotencia%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL
     OR p_request_fingerprint IS NULL OR btrim(p_request_fingerprint) = ''
     OR p_request_id IS NULL
     OR p_instituicao_id IS NULL
     OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_INVALIDOS';
  END IF;

  IF p_expires_at <= now() THEN
    RAISE EXCEPTION 'EXPIRACAO_INVALIDA';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.instituicoes WHERE id = p_instituicao_id) THEN
    RAISE EXCEPTION 'INSTITUICAO_INEXISTENTE';
  END IF;

  INSERT INTO public.autocadastro_idempotencia
    (idempotency_key, request_fingerprint, status, request_id,
     instituicao_id, expires_at, tentativas, created_at, updated_at)
  VALUES
    (p_idempotency_key, p_request_fingerprint, 'reservado', p_request_id,
     p_instituicao_id, p_expires_at, 1, now(), clock_timestamp())
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING idempotency_key INTO v_inserted_key;

  IF v_inserted_key IS NOT NULL THEN
    RETURN QUERY SELECT 'RESERVADO_NOVO'::text, NULL::uuid, NULL::uuid, p_instituicao_id;
    RETURN;
  END IF;

  SELECT * INTO v_row
    FROM public.autocadastro_idempotencia
   WHERE idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF v_row.request_fingerprint <> p_request_fingerprint THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUTILIZADA';
  END IF;

  UPDATE public.autocadastro_idempotencia
     SET tentativas = tentativas + 1,
         updated_at = clock_timestamp()
   WHERE idempotency_key = p_idempotency_key;

  IF v_row.status = 'concluido' THEN
    RETURN QUERY SELECT 'CONCLUIDO'::text, v_row.user_id, v_row.assistido_id, v_row.instituicao_id;
    RETURN;
  ELSIF v_row.status = 'reservado' THEN
    RETURN QUERY SELECT 'EM_ANDAMENTO'::text, NULL::uuid, NULL::uuid, v_row.instituicao_id;
    RETURN;
  ELSIF v_row.status = 'auth_criado' THEN
    RETURN QUERY SELECT 'RETOMAR_AUTH_CRIADO'::text, v_row.user_id, NULL::uuid, v_row.instituicao_id;
    RETURN;
  ELSIF v_row.status = 'falhou' THEN
    RETURN QUERY SELECT 'FALHA_ANTERIOR'::text, NULL::uuid, NULL::uuid, v_row.instituicao_id;
    RETURN;
  ELSIF v_row.status = 'rollback_falhou' THEN
    RETURN QUERY SELECT 'ROLLBACK_FALHOU'::text, v_row.user_id, NULL::uuid, v_row.instituicao_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'ESTADO_DESCONHECIDO';
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_autocadastro_reservar(uuid, text, uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_autocadastro_reservar(uuid, text, uuid, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.fn_autocadastro_reservar(uuid, text, uuid, uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_autocadastro_reservar(uuid, text, uuid, uuid, timestamptz) TO service_role;

-- 3) fn_autocadastro_marcar_auth_criado — versão C1.2-A (count() antigo).
CREATE OR REPLACE FUNCTION public.fn_autocadastro_marcar_auth_criado(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_request_id uuid,
  p_user_id uuid
)
RETURNS TABLE (result_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $fn$
DECLARE
  v_row public.autocadastro_idempotencia%ROWTYPE;
  v_outros integer;
BEGIN
  IF p_idempotency_key IS NULL OR p_request_fingerprint IS NULL
     OR p_request_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_INVALIDOS';
  END IF;

  SELECT * INTO v_row
    FROM public.autocadastro_idempotencia
   WHERE idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDEMPOTENCIA_INEXISTENTE';
  END IF;

  IF v_row.request_fingerprint <> p_request_fingerprint THEN
    RAISE EXCEPTION 'FINGERPRINT_DIVERGENTE';
  END IF;
  IF v_row.request_id <> p_request_id THEN
    RAISE EXCEPTION 'REQUEST_ID_DIVERGENTE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'AUTH_USER_INEXISTENTE';
  END IF;

  IF v_row.status = 'auth_criado' AND v_row.user_id = p_user_id THEN
    UPDATE public.autocadastro_idempotencia
       SET updated_at = clock_timestamp()
     WHERE idempotency_key = p_idempotency_key;
    RETURN QUERY SELECT 'AUTH_CRIADO_IDEMPOTENTE'::text;
    RETURN;
  END IF;

  IF v_row.status <> 'reservado' THEN
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_% ', v_row.status;
  END IF;

  SELECT count(*) INTO v_outros
    FROM public.autocadastro_idempotencia
   WHERE user_id = p_user_id
     AND idempotency_key <> p_idempotency_key
     AND status IN ('reservado','auth_criado');

  IF v_outros > 0 THEN
    RAISE EXCEPTION 'USER_ID_JA_EM_USO';
  END IF;

  UPDATE public.autocadastro_idempotencia
     SET status = 'auth_criado',
         user_id = p_user_id,
         result_code = 'AUTH_CRIADO',
         updated_at = clock_timestamp()
   WHERE idempotency_key = p_idempotency_key;

  RETURN QUERY SELECT 'AUTH_CRIADO'::text;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_autocadastro_marcar_auth_criado(uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_autocadastro_marcar_auth_criado(uuid, text, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_autocadastro_marcar_auth_criado(uuid, text, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_autocadastro_marcar_auth_criado(uuid, text, uuid, uuid) TO service_role;

-- 4) fn_autocadastro_marcar_resultado_falha — versão C1.2-A (sem AUTH_DELETE_NAO_CONFIRMADO).
CREATE OR REPLACE FUNCTION public.fn_autocadastro_marcar_resultado_falha(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_request_id uuid,
  p_resultado text,
  p_auth_delete_ok boolean
)
RETURNS TABLE (result_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $fn$
DECLARE
  v_row public.autocadastro_idempotencia%ROWTYPE;
  v_new_status text;
BEGIN
  IF p_idempotency_key IS NULL OR p_request_fingerprint IS NULL
     OR p_request_id IS NULL OR p_resultado IS NULL
     OR p_auth_delete_ok IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_INVALIDOS';
  END IF;

  SELECT * INTO v_row
    FROM public.autocadastro_idempotencia
   WHERE idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDEMPOTENCIA_INEXISTENTE';
  END IF;

  IF v_row.request_fingerprint <> p_request_fingerprint THEN
    RAISE EXCEPTION 'FINGERPRINT_DIVERGENTE';
  END IF;
  IF v_row.request_id <> p_request_id THEN
    RAISE EXCEPTION 'REQUEST_ID_DIVERGENTE';
  END IF;

  IF v_row.status = 'concluido' THEN
    RAISE EXCEPTION 'CONCLUIDO_NAO_REVERSIVEL';
  END IF;

  IF v_row.status = 'reservado' THEN
    v_new_status := 'falhou';
  ELSIF v_row.status = 'auth_criado' THEN
    IF p_auth_delete_ok THEN
      v_new_status := 'falhou';
    ELSE
      v_new_status := 'rollback_falhou';
    END IF;
  ELSE
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_%', v_row.status;
  END IF;

  UPDATE public.autocadastro_idempotencia
     SET status = v_new_status,
         result_code = p_resultado,
         updated_at = clock_timestamp()
   WHERE idempotency_key = p_idempotency_key;

  IF v_new_status = 'rollback_falhou' THEN
    INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
    VALUES (
      NULL,
      'AUTOCADASTRO_ROLLBACK_FALHOU',
      'autocadastro_idempotencia',
      v_row.user_id,
      jsonb_build_object(
        'request_id', p_request_id,
        'idempotency_key', p_idempotency_key,
        'instituicao_id', v_row.instituicao_id,
        'result_code', p_resultado
      )
    );
  END IF;

  RETURN QUERY SELECT v_new_status;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_autocadastro_marcar_resultado_falha(uuid, text, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_autocadastro_marcar_resultado_falha(uuid, text, uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_autocadastro_marcar_resultado_falha(uuid, text, uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_autocadastro_marcar_resultado_falha(uuid, text, uuid, text, boolean) TO service_role;

-- 5) fn_autocadastro_assistido_publico — versão C1.2-A EFETIVA (com use_column da 195717).
CREATE OR REPLACE FUNCTION public.fn_autocadastro_assistido_publico(
  p_request_id uuid, p_idempotency_key uuid, p_request_fingerprint text,
  p_instituicao_id uuid, p_user_id uuid, p_email_normalizado text,
  p_nome_completo text, p_cpf_normalizado text, p_celular_normalizado text,
  p_termos_versao text, p_privacidade_versao text, p_aceito_em timestamptz)
RETURNS TABLE (result_code text, assistido_id uuid, instituicao_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $fn$
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
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_%', v_row.status; END IF;

  IF v_row.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'USER_ID_DIVERGENTE'; END IF;

  SELECT * INTO v_inst
    FROM public.instituicoes
   WHERE id = p_instituicao_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSTITUICAO_INEXISTENTE'; END IF;
  IF v_inst.status NOT IN ('ativa','implantacao') OR NOT v_inst.autocadastro_habilitado THEN
    RAISE EXCEPTION 'INSTITUICAO_NAO_ELEGIVEL'; END IF;

  SELECT lower(email) INTO v_auth_email FROM auth.users WHERE id = p_user_id;
  IF v_auth_email IS NULL THEN RAISE EXCEPTION 'AUTH_USER_INEXISTENTE'; END IF;
  IF v_auth_email <> lower(p_email_normalizado) THEN
    RAISE EXCEPTION 'AUTH_EMAIL_DIVERGENTE'; END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.assistidos a
     WHERE a.user_id = p_user_id
       AND a.instituicao_id = p_instituicao_id
       AND a.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.instituicao_usuarios iu
     WHERE iu.user_id = p_user_id
       AND iu.instituicao_id = p_instituicao_id
  ) THEN RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE'; END IF;

  INSERT INTO public.profiles (user_id, nome_completo, status, created_by)
  VALUES (p_user_id, p_nome_completo, 'ativo', p_user_id);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'PROFILE_INSERT_FALHOU'; END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'assistido'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  BEGIN
    INSERT INTO public.assistidos
      (instituicao_id, user_id, nome, email, celular, cpf,
       status, created_by, origem_cadastro)
    VALUES
      (p_instituicao_id, p_user_id, p_nome_completo,
       p_email_normalizado, p_celular_normalizado,
       NULLIF(p_cpf_normalizado, ''),
       'aguardando_palestras', p_user_id, 'normal')
    RETURNING id INTO v_assistido_id;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE';
  END;
  IF v_assistido_id IS NULL THEN RAISE EXCEPTION 'ASSISTIDO_INSERT_FALHOU'; END IF;

  INSERT INTO public.instituicao_usuarios
    (instituicao_id, user_id, papel_local, status)
  VALUES
    (p_instituicao_id, p_user_id, 'assistido'::saas_papel_local, 'ativo'::saas_vinculo_status);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'VINCULO_INSERT_FALHOU'; END IF;

  INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
  VALUES (
    p_user_id,
    'AUTOCADASTRO_PUBLICO_ASSISTIDO',
    'assistidos',
    v_assistido_id,
    jsonb_build_object(
      'request_id', p_request_id,
      'idempotency_key', p_idempotency_key,
      'instituicao_id', p_instituicao_id,
      'termos_versao', p_termos_versao,
      'privacidade_versao', p_privacidade_versao,
      'aceito_em', p_aceito_em,
      'resultado', 'SUCESSO'
    )
  );

  UPDATE public.autocadastro_idempotencia
     SET status = 'concluido',
         assistido_id = v_assistido_id,
         result_code = 'SUCESSO',
         updated_at = clock_timestamp()
   WHERE idempotency_key = p_idempotency_key;

  RETURN QUERY SELECT 'SUCESSO'::text, v_assistido_id, p_instituicao_id;
END;
$fn$;

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

COMMIT;
