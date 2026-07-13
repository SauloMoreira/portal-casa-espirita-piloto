-- Rollback TOTAL: SAAS-06-C1-STAB10-C1.2-A (backend transacional inteiro)
-- Reverte FIX01 + A1 + C1.2-A. Não toca em C1.1 (schema/tabela de idempotência).
-- Executar em transação única, em janela de manutenção.

BEGIN;

-- Ordem: FIX01 → A1 → C1.2-A base.

-- 1) FIX01: constraint e índice reforçado.
ALTER TABLE public.autocadastro_idempotencia
  DROP CONSTRAINT IF EXISTS autocadastro_idem_estado_user_check;
DROP INDEX IF EXISTS public.ux_autocadastro_idem_user_ativo;

-- 2) A1 + C1.2-A: remover todas as RPCs do backend transacional.
DROP FUNCTION IF EXISTS public.fn_autocadastro_reservar(uuid, text, uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.fn_autocadastro_marcar_auth_criado(uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_autocadastro_marcar_resultado_falha(uuid, text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.fn_autocadastro_assistido_publico(uuid, text, uuid, uuid, text, text, text, text);

COMMIT;

-- Observações:
-- * A tabela public.autocadastro_idempotencia e seus CHECKs base (C1.1) permanecem.
-- * Para reverter também C1.1, aplicar migration inversa da fundação (fora deste escopo).
-- * Não há dados de negócio nas RPCs; auditorias emitidas permanecem em audit_logs.
