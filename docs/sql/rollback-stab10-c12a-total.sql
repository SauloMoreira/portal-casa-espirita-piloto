-- Rollback TOTAL: SAAS-06-C1-STAB10-C1.2-A + A1 + FIX01
-- Remove COMPLETAMENTE o backend transacional do autocadastro público
-- tenant-aware. Use somente para desativar o subsistema por inteiro.
--
-- Precondição: nenhum fluxo de autocadastro em andamento; frontend/Edge
-- Function já desligados; nenhuma referência viva às RPCs.
--
-- Executar em transação única, em janela de manutenção.

BEGIN;

-- 1) Índices e constraints do FIX01/A1.
DROP INDEX IF EXISTS public.ux_autocadastro_idem_user_ativo;
ALTER TABLE IF EXISTS public.autocadastro_idempotencia
  DROP CONSTRAINT IF EXISTS autocadastro_idem_estado_user_check;

-- 2) Remover as quatro RPCs (assinaturas exatas do C1.2-A/A1/FIX01).
DROP FUNCTION IF EXISTS public.fn_autocadastro_reservar(
  uuid, text, uuid, uuid, timestamptz
);
DROP FUNCTION IF EXISTS public.fn_autocadastro_marcar_auth_criado(
  uuid, text, uuid, uuid
);
DROP FUNCTION IF EXISTS public.fn_autocadastro_marcar_resultado_falha(
  uuid, text, uuid, text, boolean
);
DROP FUNCTION IF EXISTS public.fn_autocadastro_assistido_publico(
  uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, timestamptz
);

-- 3) Remover a tabela de idempotência (nenhuma outra feature depende dela).
DROP TABLE IF EXISTS public.autocadastro_idempotencia;

-- 4) Reverter as flags institucionais adicionadas no C1.1.
ALTER TABLE IF EXISTS public.instituicoes
  DROP COLUMN IF EXISTS autocadastro_habilitado,
  DROP COLUMN IF EXISTS autocadastro_termos_versao,
  DROP COLUMN IF EXISTS autocadastro_privacidade_versao;

COMMIT;
