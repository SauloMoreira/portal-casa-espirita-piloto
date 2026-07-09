
-- SAAS-06-B0.4 — Portal do Cliente: solicitações comerciais + campos comerciais complementares

-- 1) Campos comerciais complementares na assinatura
ALTER TABLE public.assinaturas
  ADD COLUMN IF NOT EXISTS classificacao text
    CHECK (classificacao IS NULL OR classificacao IN ('demo','piloto','producao_assistida','cliente')),
  ADD COLUMN IF NOT EXISTS observacoes_cliente text;

COMMENT ON COLUMN public.assinaturas.classificacao IS
  'Classificação comercial visível ao cliente: demo, piloto, producao_assistida, cliente.';
COMMENT ON COLUMN public.assinaturas.observacoes_cliente IS
  'Observações comerciais visíveis ao admin local da instituição (cliente).';
COMMENT ON COLUMN public.assinaturas.observacoes_comerciais IS
  'Observações comerciais internas (visíveis apenas a platform_admin).';

-- 2) Tabela solicitacoes_comerciais
CREATE TABLE IF NOT EXISTS public.solicitacoes_comerciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instituicao_id uuid NOT NULL REFERENCES public.instituicoes(id) ON DELETE CASCADE,
  solicitante_user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN (
    'novo_modulo','desabilitar_modulo','alterar_plano',
    'segunda_via_cobranca','cancelamento','contato_comercial','outro'
  )),
  modulo_codigo text,
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente','em_analise','aguardando_pagamento','aprovada','recusada','concluida','cancelada'
  )),
  observacao_interna text,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS solicitacoes_comerciais_inst_idx
  ON public.solicitacoes_comerciais(instituicao_id, created_at DESC);
CREATE INDEX IF NOT EXISTS solicitacoes_comerciais_status_idx
  ON public.solicitacoes_comerciais(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.solicitacoes_comerciais TO authenticated;
GRANT ALL ON public.solicitacoes_comerciais TO service_role;

ALTER TABLE public.solicitacoes_comerciais ENABLE ROW LEVEL SECURITY;

-- Helper: verifica vínculo admin_instituicao ATIVO do usuário na instituição
CREATE OR REPLACE FUNCTION public.fn_is_admin_instituicao(_user_id uuid, _inst_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instituicao_usuarios
    WHERE user_id = _user_id
      AND instituicao_id = _inst_id
      AND papel_local = 'admin_instituicao'
      AND status = 'ativo'
  );
$$;

-- Helper: verifica platform admin
CREATE OR REPLACE FUNCTION public.fn_is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  );
$$;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.fn_solicitacoes_comerciais_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('aprovada','recusada','concluida','cancelada') AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.concluida_em := COALESCE(NEW.concluida_em, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitacoes_comerciais_touch ON public.solicitacoes_comerciais;
CREATE TRIGGER trg_solicitacoes_comerciais_touch
  BEFORE UPDATE ON public.solicitacoes_comerciais
  FOR EACH ROW EXECUTE FUNCTION public.fn_solicitacoes_comerciais_touch();

-- RLS Policies
-- SELECT: platform_admin vê tudo; admin local vê da própria instituição.
CREATE POLICY "solicitacoes_comerciais_select"
  ON public.solicitacoes_comerciais FOR SELECT
  TO authenticated
  USING (
    public.fn_is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
  );

-- INSERT: admin local pode criar para a própria instituição; platform_admin também.
CREATE POLICY "solicitacoes_comerciais_insert"
  ON public.solicitacoes_comerciais FOR INSERT
  TO authenticated
  WITH CHECK (
    solicitante_user_id = auth.uid()
    AND (
      public.fn_is_platform_admin(auth.uid())
      OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
    )
  );

-- UPDATE: apenas platform_admin altera status/observacao_interna.
-- (admin local NÃO altera após criar; se precisar cancelar, cria outra solicitação
-- ou o platform_admin altera o status.)
CREATE POLICY "solicitacoes_comerciais_update_platform"
  ON public.solicitacoes_comerciais FOR UPDATE
  TO authenticated
  USING (public.fn_is_platform_admin(auth.uid()))
  WITH CHECK (public.fn_is_platform_admin(auth.uid()));
