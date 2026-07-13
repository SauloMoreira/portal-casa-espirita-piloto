-- Rollback: SAAS-06-C1-STAB10-C1.2-A1 (hardening base)
-- Executar APÓS aplicar rollback-stab10-c12a-fix01.sql.
-- Reverte índice único parcial e restaura as RPCs à versão C1.2-A original.

BEGIN;

DROP INDEX IF EXISTS public.ux_autocadastro_idem_user_ativo;

-- Restaurar RPCs à versão C1.2-A:
--   Fonte canônica: supabase/migrations/20260713202343_e917dd55-326a-42eb-a2f2-03609d4932a6.sql
--   (executar os blocos CREATE OR REPLACE FUNCTION daquela migration).

COMMIT;
