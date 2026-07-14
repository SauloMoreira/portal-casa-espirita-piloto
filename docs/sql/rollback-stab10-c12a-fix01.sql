-- Rollback: SAAS-06-C1-STAB10-C1.2-A1-FIX01
-- Reverte SOMENTE o hardening FIX01: restaura o predicado do índice ao estado A1,
-- remove o CHECK de coerência status × user_id e restaura as versões A1 EFETIVAS
-- das três RPCs alteradas (marcar_auth_criado, marcar_resultado_falha,
-- assistido_publico). Não toca na RPC de reserva (FIX01 não a alterou).
--
-- Precondição: nenhuma linha viva pode violar o predicado antigo. Verificar:
--   SELECT count(*) FROM public.autocadastro_idempotencia
--    WHERE user_id IS NOT NULL
--      AND status IN ('reservado','auth_criado')
--    GROUP BY user_id HAVING count(*) > 1;
--
-- Executar em transação única, em janela de manutenção.

BEGIN;

-- 1) Restaurar o índice único parcial ao predicado A1.
DROP INDEX IF EXISTS public.ux_autocadastro_idem_user_ativo;
CREATE UNIQUE INDEX ux_autocadastro_idem_user_ativo
  ON public.autocadastro_idempotencia(user_id)
  WHERE user_id IS NOT NULL
    AND status IN ('reservado','auth_criado');

-- 2) Remover o CHECK de coerência introduzido pelo FIX01.
ALTER TABLE public.autocadastro_idempotencia
  DROP CONSTRAINT IF EXISTS autocadastro_idem_estado_user_check;

-- 3) fn_autocadastro_marcar_auth_criado — versão A1 (literal SEM sufixo dinâmico).
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
  v_rows integer;
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
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'FALHA_ATUALIZAR_TIMESTAMP_AUTH_CRIADO';
    END IF;
    RETURN QUERY SELECT 'AUTH_CRIADO_IDEMPOTENTE'::text;
    RETURN;
  END IF;

  IF v_row.status <> 'reservado' THEN
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_RESERVADO_AUTH_CRIADO (origem=%)', v_row.status;
  END IF;

  BEGIN
    UPDATE public.autocadastro_idempotencia
       SET status = 'auth_criado',
           user_id = p_user_id,
           result_code = 'AUTH_CRIADO',
           updated_at = clock_timestamp()
     WHERE idempotency_key = p_idempotency_key
       AND status = 'reservado';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'TRANSICAO_INVALIDA_RESERVADO_AUTH_CRIADO (linha alterada por outra transação)';
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'USER_ID_JA_EM_USO';
  END;

  RETURN QUERY SELECT 'AUTH_CRIADO'::text;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_autocadastro_marcar_auth_criado(uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_autocadastro_marcar_auth_criado(uuid, text, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_autocadastro_marcar_auth_criado(uuid, text, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_autocadastro_marcar_auth_criado(uuid, text, uuid, uuid) TO service_role;

-- 4) fn_autocadastro_marcar_resultado_falha — versão A1 (sem AUTH_DELETE_NAO_CONFIRMADO).
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
  v_origem text;
  v_rows integer;
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
  IF NOT FOUND THEN RAISE EXCEPTION 'IDEMPOTENCIA_INEXISTENTE'; END IF;

  IF v_row.request_fingerprint <> p_request_fingerprint THEN
    RAISE EXCEPTION 'FINGERPRINT_DIVERGENTE'; END IF;
  IF v_row.request_id <> p_request_id THEN
    RAISE EXCEPTION 'REQUEST_ID_DIVERGENTE'; END IF;

  IF v_row.status = 'concluido' THEN
    RAISE EXCEPTION 'CONCLUIDO_NAO_REVERSIVEL';
  END IF;

  v_origem := v_row.status;
  IF v_row.status = 'reservado' THEN
    v_new_status := 'falhou';
  ELSIF v_row.status = 'auth_criado' THEN
    IF p_auth_delete_ok THEN v_new_status := 'falhou';
    ELSE v_new_status := 'rollback_falhou'; END IF;
  ELSE
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_FALHA (origem=%)', v_row.status;
  END IF;

  UPDATE public.autocadastro_idempotencia
     SET status = v_new_status,
         result_code = p_resultado,
         updated_at = clock_timestamp()
   WHERE idempotency_key = p_idempotency_key
     AND status = v_origem;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_FALHA (linha alterada por outra transação)';
  END IF;

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

-- 5) fn_autocadastro_assistido_publico — versão A1 EFETIVA (após migrations corretivas 202019/202343).
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
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_%', v_row.status;
  END IF;

  IF v_row.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'USER_ID_DIVERGENTE';
  END IF;

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
    SELECT 1 FROM public.assistidos a
     WHERE a.user_id = p_user_id
       AND a.instituicao_id = p_instituicao_id
       AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.instituicao_usuarios iu
     WHERE iu.user_id = p_user_id AND iu.instituicao_id = p_instituicao_id
  ) THEN
    RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE';
  END IF;

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
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CADASTRO_JA_EXISTENTE';
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
   WHERE idempotency_key = p_idempotency_key
     AND status = 'auth_criado';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'TRANSICAO_INVALIDA_AUTH_CRIADO_CONCLUIDO (linha alterada por outra transação)';
  END IF;

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
