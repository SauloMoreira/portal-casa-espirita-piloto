
-- STAB10-C1.1 — Fundação segura do autocadastro tenant-aware

-- 1) Flags institucionais (ambas default false; nenhuma instituição habilitada)
ALTER TABLE public.instituicoes
  ADD COLUMN IF NOT EXISTS autocadastro_habilitado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autocadastro_listado    boolean NOT NULL DEFAULT false;

-- 2) Tabela de idempotência do autocadastro
CREATE TABLE IF NOT EXISTS public.autocadastro_idempotencia (
  idempotency_key      uuid PRIMARY KEY,
  request_fingerprint  text NOT NULL,
  status               text NOT NULL
    CHECK (status IN ('reservado','auth_criado','concluido','falhou','rollback_falhou')),
  request_id           uuid NOT NULL,
  instituicao_id       uuid NOT NULL REFERENCES public.instituicoes(id) ON DELETE RESTRICT,
  user_id              uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  assistido_id         uuid NULL REFERENCES public.assistidos(id) ON DELETE SET NULL,
  result_code          text NULL,
  tentativas           integer NOT NULL DEFAULT 1 CHECK (tentativas > 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL,
  CONSTRAINT autocadastro_idempotencia_expira_apos_criacao CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS ix_autocad_idem_status
  ON public.autocadastro_idempotencia (status);
CREATE INDEX IF NOT EXISTS ix_autocad_idem_expires_at
  ON public.autocadastro_idempotencia (expires_at);
CREATE INDEX IF NOT EXISTS ix_autocad_idem_inst_status
  ON public.autocadastro_idempotencia (instituicao_id, status);

-- 3) Segurança: sem grants públicos, RLS on, sem policies (fechado por desenho)
REVOKE ALL ON public.autocadastro_idempotencia FROM PUBLIC;
REVOKE ALL ON public.autocadastro_idempotencia FROM anon;
REVOKE ALL ON public.autocadastro_idempotencia FROM authenticated;
GRANT  ALL ON public.autocadastro_idempotencia TO service_role;
ALTER TABLE public.autocadastro_idempotencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autocadastro_idempotencia FORCE ROW LEVEL SECURITY;

-- 4) Índice institucional único do assistido — aborta se houver duplicidade ativa
DO $$
DECLARE v_dups integer;
BEGIN
  SELECT count(*) INTO v_dups FROM (
    SELECT instituicao_id, user_id
      FROM public.assistidos
     WHERE user_id IS NOT NULL AND deleted_at IS NULL
     GROUP BY instituicao_id, user_id
    HAVING count(*) > 1
  ) x;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'STAB10-C1.1: existem % duplicidades ativas (instituicao_id,user_id); abortar índice único', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ix_assistidos_inst_user_ativo
  ON public.assistidos (instituicao_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
