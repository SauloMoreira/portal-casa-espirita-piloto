-- SAAS-06-C1-STAB10-C1.2-B1-FIX01 — Retomada canônica, invariantes de rate-limit.
DO $mig$
DECLARE v_ativos int;
BEGIN
  SELECT count(*) INTO v_ativos FROM public.autocadastro_rate_limit WHERE expires_at > now();
  IF v_ativos > 0 THEN RAISE EXCEPTION 'FIX01_ABORTADO: % buckets ativos incompatíveis', v_ativos; END IF;
END $mig$;

DELETE FROM public.autocadastro_rate_limit
 WHERE expires_at < now()
   AND expires_at <> window_start + interval '10 minutes';

ALTER TABLE public.autocadastro_rate_limit
  DROP CONSTRAINT IF EXISTS autocadastro_rate_limit_window_check;
ALTER TABLE public.autocadastro_rate_limit
  ADD  CONSTRAINT autocadastro_rate_limit_window_check
  CHECK (expires_at = window_start + interval '10 minutes');

DROP FUNCTION IF EXISTS public.fn_autocadastro_rate_limit_hit(
  text, text, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION public.fn_autocadastro_rate_limit_hit(
  p_scope      text,
  p_bucket_key text
)
RETURNS TABLE (
  permitido           boolean,
  contador            integer,
  limite              integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit    integer;
  v_start    timestamptz;
  v_exp      timestamptz;
  v_row      public.autocadastro_rate_limit%ROWTYPE;
  v_contador integer;
  v_retry    integer;
BEGIN
  IF p_scope IS NULL OR p_bucket_key IS NULL THEN RAISE EXCEPTION 'PARAMETROS_INVALIDOS'; END IF;
  IF btrim(p_bucket_key) = '' OR length(p_bucket_key) > 128 THEN
    RAISE EXCEPTION 'BUCKET_KEY_INVALIDA';
  END IF;
  IF    p_scope = 'ip'          THEN v_limit := 5;
  ELSIF p_scope = 'email'       THEN v_limit := 3;
  ELSIF p_scope = 'instituicao' THEN v_limit := 30;
  ELSE  RAISE EXCEPTION 'SCOPE_INVALIDO';
  END IF;

  v_start := to_timestamp(floor(extract(epoch FROM now()) / 600) * 600);
  v_exp   := v_start + interval '10 minutes';

  DELETE FROM public.autocadastro_rate_limit
   WHERE ctid IN (
     SELECT ctid FROM public.autocadastro_rate_limit
      WHERE expires_at < now() LIMIT 50
   );

  INSERT INTO public.autocadastro_rate_limit
    (scope, bucket_key, window_start, contador, expires_at, created_at, updated_at)
  VALUES
    (p_scope, p_bucket_key, v_start, 1, v_exp, now(), now())
  ON CONFLICT (scope, bucket_key, window_start) DO UPDATE
    SET contador   = public.autocadastro_rate_limit.contador + 1,
        updated_at = now()
  RETURNING * INTO v_row;

  v_contador := v_row.contador;
  v_retry    := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_row.expires_at - now())))::integer);
  RETURN QUERY SELECT (v_contador <= v_limit), v_contador, v_limit, v_retry;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text) TO service_role;

COMMENT ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text) IS
  'STAB10-C1.2-B1-FIX01: bucket atômico; janela fixa 10min calculada no servidor; limites 5/3/30.';

DO $mig$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_autocadastro_rate_limit_hit';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FIX01_ASSINATURA_UNICA_ESPERADA: encontrado %', v_count;
  END IF;
END $mig$;