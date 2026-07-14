-- SAAS-06-C1-STAB10-C1.2-B1 — Fundação persistente de rate-limit do autocadastro público.
-- Cria APENAS a tabela public.autocadastro_rate_limit e a RPC atômica
-- public.fn_autocadastro_rate_limit_hit. Fechada por padrão (RLS + FORCE RLS,
-- sem policies, EXECUTE somente para service_role).

-- 1) TABELA
CREATE TABLE IF NOT EXISTS public.autocadastro_rate_limit (
  scope         text        NOT NULL,
  bucket_key    text        NOT NULL,
  window_start  timestamptz NOT NULL,
  contador      integer     NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT autocadastro_rate_limit_pk PRIMARY KEY (scope, bucket_key, window_start),
  CONSTRAINT autocadastro_rate_limit_scope_check
    CHECK (scope IN ('ip','email','instituicao')),
  CONSTRAINT autocadastro_rate_limit_contador_check
    CHECK (contador > 0),
  CONSTRAINT autocadastro_rate_limit_window_check
    CHECK (expires_at > window_start),
  CONSTRAINT autocadastro_rate_limit_bucket_key_check
    CHECK (btrim(bucket_key) <> '' AND length(bucket_key) <= 128)
);

-- 2) GRANTS (fechado por padrão; nenhum acesso a anon/authenticated/PUBLIC)
REVOKE ALL ON public.autocadastro_rate_limit FROM PUBLIC;
REVOKE ALL ON public.autocadastro_rate_limit FROM anon;
REVOKE ALL ON public.autocadastro_rate_limit FROM authenticated;
GRANT ALL ON public.autocadastro_rate_limit TO service_role;

-- 3) RLS + FORCE RLS (sem policies -> ninguém, exceto service_role, acessa)
ALTER TABLE public.autocadastro_rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autocadastro_rate_limit FORCE  ROW LEVEL SECURITY;

-- 4) ÍNDICE para cleanup por expiração
CREATE INDEX IF NOT EXISTS ix_autocadastro_rate_limit_expires
  ON public.autocadastro_rate_limit (expires_at);

-- 5) RPC ATÔMICA — limites internos fixos, janela fixa 10 min
CREATE OR REPLACE FUNCTION public.fn_autocadastro_rate_limit_hit(
  p_scope        text,
  p_bucket_key   text,
  p_window_start timestamptz,
  p_expires_at   timestamptz
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
  v_limit      integer;
  v_row        public.autocadastro_rate_limit%ROWTYPE;
  v_contador   integer;
  v_retry      integer;
BEGIN
  IF p_scope IS NULL OR p_bucket_key IS NULL
     OR p_window_start IS NULL OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_INVALIDOS';
  END IF;

  IF btrim(p_bucket_key) = '' OR length(p_bucket_key) > 128 THEN
    RAISE EXCEPTION 'BUCKET_KEY_INVALIDA';
  END IF;

  IF p_expires_at <= p_window_start THEN
    RAISE EXCEPTION 'JANELA_INVALIDA';
  END IF;

  IF    p_scope = 'ip'          THEN v_limit := 5;
  ELSIF p_scope = 'email'       THEN v_limit := 3;
  ELSIF p_scope = 'instituicao' THEN v_limit := 30;
  ELSE  RAISE EXCEPTION 'SCOPE_INVALIDO';
  END IF;

  -- Cleanup oportunístico e LIMITADO de linhas expiradas (nunca DELETE amplo)
  DELETE FROM public.autocadastro_rate_limit
   WHERE ctid IN (
     SELECT ctid FROM public.autocadastro_rate_limit
      WHERE expires_at < now()
      LIMIT 50
   );

  -- UPSERT atômico
  INSERT INTO public.autocadastro_rate_limit
    (scope, bucket_key, window_start, contador, expires_at, created_at, updated_at)
  VALUES
    (p_scope, p_bucket_key, p_window_start, 1, p_expires_at, now(), now())
  ON CONFLICT (scope, bucket_key, window_start) DO UPDATE
    SET contador   = public.autocadastro_rate_limit.contador + 1,
        updated_at = now()
  RETURNING * INTO v_row;

  v_contador := v_row.contador;
  v_retry    := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_row.expires_at - now())))::integer);

  RETURN QUERY SELECT (v_contador <= v_limit), v_contador, v_limit, v_retry;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text, timestamptz, timestamptz) TO service_role;

COMMENT ON TABLE  public.autocadastro_rate_limit IS
  'STAB10-C1.2-B1: buckets HMAC de rate-limit do autocadastro público. Fechada; acesso apenas via service_role.';
COMMENT ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text, timestamptz, timestamptz) IS
  'STAB10-C1.2-B1: incrementa atomicamente o bucket, aplica limites internos (ip=5, email=3, instituicao=30), janela fixa 10 min, retorna permitido/contador/limite/retry_after.';