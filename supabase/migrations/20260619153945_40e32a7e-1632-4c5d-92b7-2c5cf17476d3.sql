-- ============================================================
-- Módulo 4: Consentimento e opt-out de comunicação (WhatsApp)
-- ============================================================

-- 1) Campos de consentimento explícito na tabela de preferências
ALTER TABLE public.notificacoes_preferencias
  ADD COLUMN IF NOT EXISTS consentimento_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS consentimento_at timestamptz,
  ADD COLUMN IF NOT EXISTS consentimento_origem text,
  ADD COLUMN IF NOT EXISTS consentimento_versao text;

-- 2) Histórico imutável de consentimento (opt-in / opt-out)
CREATE TABLE public.consentimentos_comunicacao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assistido_id uuid NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  canal text NOT NULL DEFAULT 'whatsapp',
  acao text NOT NULL,
  origem text NOT NULL DEFAULT 'app',
  versao_termo text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

GRANT SELECT, INSERT ON public.consentimentos_comunicacao TO authenticated;
GRANT ALL ON public.consentimentos_comunicacao TO service_role;

ALTER TABLE public.consentimentos_comunicacao ENABLE ROW LEVEL SECURITY;

-- Assistido vê o próprio histórico; staff vê tudo
CREATE POLICY "Assistido vê seu histórico de consentimento"
  ON public.consentimentos_comunicacao FOR SELECT TO authenticated
  USING (
    assistido_id IN (SELECT id FROM public.assistidos WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'coordenador_de_tratamento')
  );

-- Assistido registra o próprio consentimento; staff registra em nome do assistido
CREATE POLICY "Registro de consentimento"
  ON public.consentimentos_comunicacao FOR INSERT TO authenticated
  WITH CHECK (
    assistido_id IN (SELECT id FROM public.assistidos WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'coordenador_de_tratamento')
  );

CREATE TRIGGER update_consentimentos_comunicacao_updated_at
  BEFORE UPDATE ON public.consentimentos_comunicacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER stamp_actor_consentimentos_comunicacao
  BEFORE INSERT OR UPDATE ON public.consentimentos_comunicacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_stamp_actor();

CREATE INDEX idx_consentimentos_comunicacao_assistido
  ON public.consentimentos_comunicacao (assistido_id, created_at DESC);