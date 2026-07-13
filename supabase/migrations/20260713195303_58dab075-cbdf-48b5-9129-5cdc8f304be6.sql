
-- Ajuste: updated_at usa clock_timestamp() para ser monotonicamente crescente
-- mesmo dentro de uma única transação. Nenhuma outra mudança de lógica.

CREATE OR REPLACE FUNCTION public.fn_autocadastro_reservar(
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
AS $$
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
$$;

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
AS $$
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
$$;

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
AS $$
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
$$;
