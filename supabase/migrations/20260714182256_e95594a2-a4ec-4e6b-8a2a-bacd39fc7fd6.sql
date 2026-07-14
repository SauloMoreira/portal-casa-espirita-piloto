
-- SAAS-06-C1-STAB10-C1.2-B1-FIX02 — Constraint canônica de janela fixa e reafirmação da assinatura única.
-- Aditiva; não altera dados. Não usa CASCADE.

DO $$
DECLARE
  v_incompat integer;
  v_ativos_total integer;
BEGIN
  SELECT count(*) INTO v_incompat
    FROM public.autocadastro_rate_limit
   WHERE expires_at > now()
     AND expires_at IS DISTINCT FROM (window_start + interval '10 minutes');
  IF v_incompat > 0 THEN
    RAISE EXCEPTION 'RATE_LIMIT_BUCKETS_ATIVOS_INCOMPATIVEIS: %', v_incompat;
  END IF;

  SELECT count(*) INTO v_ativos_total FROM public.autocadastro_rate_limit
   WHERE expires_at > now() AND expires_at <> window_start + interval '10 minutes';
  IF v_ativos_total > 0 THEN
    RAISE EXCEPTION 'RATE_LIMIT_ROWS_ATIVAS_FORA_DO_CANONICO: %', v_ativos_total;
  END IF;
END $$;

-- Constraint canônica exata (igualdade), substitui a versão FIX01 (intervalo).
ALTER TABLE public.autocadastro_rate_limit
  DROP CONSTRAINT IF EXISTS autocadastro_rate_limit_window_check;
ALTER TABLE public.autocadastro_rate_limit
  ADD CONSTRAINT autocadastro_rate_limit_window_check
  CHECK (expires_at = window_start + interval '10 minutes');

-- Reafirma: assinatura histórica ausente (sem CASCADE).
DROP FUNCTION IF EXISTS public.fn_autocadastro_rate_limit_hit(text, text, timestamptz, timestamptz);

-- Reafirma grants canônicos da assinatura ativa única.
REVOKE ALL   ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text) FROM PUBLIC;
REVOKE ALL   ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text) FROM anon;
REVOKE ALL   ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_autocadastro_rate_limit_hit(text, text) TO service_role;

COMMENT ON CONSTRAINT autocadastro_rate_limit_window_check
  ON public.autocadastro_rate_limit IS
  'STAB10-C1.2-B1-FIX02: janela canônica de 10 minutos exata (igualdade).';
