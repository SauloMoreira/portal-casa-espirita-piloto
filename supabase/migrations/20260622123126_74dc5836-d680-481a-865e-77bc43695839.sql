
-- 1. Enum de status da etapa do plano
DO $$ BEGIN
  CREATE TYPE public.status_etapa_plano AS ENUM (
    'prevista','ativa','realizada','ausente','suspensa','cancelada','liberada_para_comparecimento_publico'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabela do plano previsto
CREATE TABLE IF NOT EXISTS public.plano_tratamento_sessoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assistido_id uuid NOT NULL,
  assistido_tratamento_id uuid NOT NULL,
  tipo_tratamento_id uuid NOT NULL,
  ordem_tratamento integer,
  numero_etapa integer NOT NULL,
  quantidade_total_do_tratamento integer NOT NULL,
  status_etapa public.status_etapa_plano NOT NULL DEFAULT 'prevista',
  data_prevista date,
  data_base_utilizada date,
  eh_publico_livre boolean NOT NULL DEFAULT false,
  bloqueado_por_etapa_anterior boolean NOT NULL DEFAULT false,
  agenda_sessao_id uuid REFERENCES public.agenda_tratamentos_assistido(id) ON DELETE SET NULL,
  origem text NOT NULL DEFAULT 'plano',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plano_origem_chk CHECK (origem IN ('plano','migracao')),
  CONSTRAINT plano_etapa_unica UNIQUE (assistido_tratamento_id, numero_etapa)
);

-- 3. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_tratamento_sessoes TO authenticated;
GRANT ALL ON public.plano_tratamento_sessoes TO service_role;

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_plano_assistido ON public.plano_tratamento_sessoes (assistido_id);
CREATE INDEX IF NOT EXISTS idx_plano_vinculo ON public.plano_tratamento_sessoes (assistido_tratamento_id);
CREATE INDEX IF NOT EXISTS idx_plano_status ON public.plano_tratamento_sessoes (status_etapa);
-- No máximo 1 etapa ativa por vínculo
CREATE UNIQUE INDEX IF NOT EXISTS uq_plano_etapa_ativa
  ON public.plano_tratamento_sessoes (assistido_tratamento_id)
  WHERE status_etapa = 'ativa';

-- 5. RLS
ALTER TABLE public.plano_tratamento_sessoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage plano_tratamento_sessoes"
  ON public.plano_tratamento_sessoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entrevistadores manage plano_tratamento_sessoes"
  ON public.plano_tratamento_sessoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role));

CREATE POLICY "Tarefeiros read plano_tratamento_sessoes"
  ON public.plano_tratamento_sessoes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role));

CREATE POLICY "Tarefeiros update plano_tratamento_sessoes"
  ON public.plano_tratamento_sessoes FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role))
  WITH CHECK (has_role(auth.uid(), 'tarefeiro'::app_role));

CREATE POLICY "Coordenador reads plano_tratamento_sessoes"
  ON public.plano_tratamento_sessoes FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
    AND tipo_tratamento_id IN (
      SELECT id FROM public.tipos_tratamento WHERE coordenador_responsavel_id = auth.uid()
    )
  );

CREATE POLICY "Coordenador updates plano_tratamento_sessoes"
  ON public.plano_tratamento_sessoes FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
    AND tipo_tratamento_id IN (
      SELECT id FROM public.tipos_tratamento WHERE coordenador_responsavel_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
    AND tipo_tratamento_id IN (
      SELECT id FROM public.tipos_tratamento WHERE coordenador_responsavel_id = auth.uid()
    )
  );

CREATE POLICY "Assistido views own plano_tratamento_sessoes"
  ON public.plano_tratamento_sessoes FOR SELECT TO authenticated
  USING (
    assistido_id IN (SELECT id FROM public.assistidos WHERE user_id = auth.uid())
  );

-- 6. Triggers (updated_at + auditoria) — finos, sem regra de negócio
CREATE TRIGGER trg_plano_updated_at
  BEFORE UPDATE ON public.plano_tratamento_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_plano_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.plano_tratamento_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- 7. Estado operacional em assistido_tratamentos
ALTER TABLE public.assistido_tratamentos
  ADD COLUMN IF NOT EXISTS faltas_consecutivas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remarcacoes_automaticas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_presenca_em date,
  ADD COLUMN IF NOT EXISTS ultimo_status_operacional text;

-- 8. Gate por assistido
ALTER TABLE public.assistidos
  ADD COLUMN IF NOT EXISTS usa_agenda_plano boolean NOT NULL DEFAULT false;

-- 9. Parâmetros operacionais (key-value)
INSERT INTO public.regras_operacionais (chave, valor, descricao, ativo) VALUES
  ('tratamento_max_remarcacoes_automaticas', '7', 'Máximo de remarcações automáticas de uma etapa antes de suspender por inatividade', true),
  ('tratamento_max_faltas_consecutivas', '3', 'Máximo de faltas consecutivas antes de suspender por inatividade', true),
  ('tratamento_max_dias_sem_presenca', '60', 'Máximo de dias sem presença antes de suspender por inatividade', true),
  ('agenda_plano_ativo', 'false', 'Flag global do novo modelo de agenda (plano previsto + agenda ativa + histórico)', true)
ON CONFLICT (chave) DO NOTHING;
