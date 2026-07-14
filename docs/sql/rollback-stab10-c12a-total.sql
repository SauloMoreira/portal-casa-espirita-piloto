-- Rollback TOTAL: SAAS-06-C1-STAB10-C1.2-A + A1 + FIX01
-- Remove somente o BACKEND TRANSACIONAL do autocadastro público tenant-aware.
--
-- Preserva integralmente a fundação C1.1:
--   - tabela public.autocadastro_idempotencia (e seus dados);
--   - flags autocadastro_habilitado / autocadastro_termos_versao /
--     autocadastro_privacidade_versao / autocadastro_listado em
--     public.instituicoes;
--   - índice ix_assistidos_inst_user_ativo em public.assistidos.
--
-- Reversão de C1.1 é procedimento independente e não integra este script.
--
-- Precondição: nenhum fluxo de autocadastro em andamento; frontend/Edge
-- Function já desligados; nenhuma referência viva às RPCs.
--
-- Executar em transação única, em janela de manutenção. Nunca usar CASCADE.

BEGIN;

-- 1) Índice e CHECK introduzidos por FIX01/A1 sobre a tabela de idempotência.
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

COMMIT;
