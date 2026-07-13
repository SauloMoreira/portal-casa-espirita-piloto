
-- SAAS-06-C1-STAB10-C1.2-A1-FIX01 — parte 1/2: índice parcial correto + CHECK de coerência status × user_id.
-- Executa pré-checks fail-closed: aborta se houver duplicidades ou incoerências preexistentes.

DO $mig$
DECLARE
  v_dup   integer;
  v_incoh integer;
BEGIN
  SELECT count(*) INTO v_dup FROM (
    SELECT user_id
      FROM public.autocadastro_idempotencia
     WHERE user_id IS NOT NULL
       AND status IN ('auth_criado','concluido','rollback_falhou')
     GROUP BY user_id
    HAVING count(*) > 1
  ) t;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'DUPLICIDADE_USER_ID_IDEMPOTENCIA (grupos=%)', v_dup;
  END IF;

  SELECT count(*) INTO v_incoh
    FROM public.autocadastro_idempotencia
   WHERE (status = 'reservado' AND user_id IS NOT NULL)
      OR (status = 'falhou'    AND user_id IS NOT NULL)
      OR (status IN ('concluido','rollback_falhou') AND user_id IS NULL);
  IF v_incoh > 0 THEN
    RAISE EXCEPTION 'INCOERENCIA_STATUS_USER_ID (linhas=%)', v_incoh;
  END IF;
END
$mig$;

-- Índice parcial correto
DROP INDEX IF EXISTS public.ux_autocadastro_idem_user_ativo;
CREATE UNIQUE INDEX ux_autocadastro_idem_user_ativo
  ON public.autocadastro_idempotencia(user_id)
  WHERE user_id IS NOT NULL
    AND status IN ('auth_criado','concluido','rollback_falhou');

-- CHECK de coerência status × user_id
ALTER TABLE public.autocadastro_idempotencia
  DROP CONSTRAINT IF EXISTS autocadastro_idem_estado_user_check;
ALTER TABLE public.autocadastro_idempotencia
  ADD CONSTRAINT autocadastro_idem_estado_user_check CHECK (
    (status = 'reservado'       AND user_id IS NULL)
 OR (status = 'falhou'          AND user_id IS NULL)
 OR (status = 'concluido'       AND user_id IS NOT NULL)
 OR (status = 'rollback_falhou' AND user_id IS NOT NULL)
 OR (status = 'auth_criado')  -- pode ter user_id ou NULL após ON DELETE SET NULL
  );
