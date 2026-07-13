-- Rollback: SAAS-06-C1-STAB10-C1.2-A1-FIX01
-- Reverte SOMENTE o hardening FIX01 (índice, CHECK de coerência, literais e
-- proteção AUTH_DELETE_NAO_CONFIRMADO). Preserva o backend transacional (C1.2-A)
-- e o hardening base A1.
-- Pré-requisito: nenhuma linha viva depende do CHECK novo. Rodar em transação.

BEGIN;

-- 1) Restaurar índice único parcial ao predicado A1 (inclui 'reservado').
DROP INDEX IF EXISTS public.ux_autocadastro_idem_user_ativo;
CREATE UNIQUE INDEX ux_autocadastro_idem_user_ativo
  ON public.autocadastro_idempotencia(user_id)
  WHERE user_id IS NOT NULL
    AND status IN ('reservado','auth_criado','concluido','rollback_falhou');

-- 2) Remover CHECK de coerência status × user_id.
ALTER TABLE public.autocadastro_idempotencia
  DROP CONSTRAINT IF EXISTS autocadastro_idem_estado_user_check;

-- 3) Reaplicar corpo A1 das RPCs afetadas.
--    Fonte canônica: supabase/migrations/20260713-a1-rpcs.sql
--    (executar o bloco CREATE OR REPLACE FUNCTION daquela migration).

COMMIT;
