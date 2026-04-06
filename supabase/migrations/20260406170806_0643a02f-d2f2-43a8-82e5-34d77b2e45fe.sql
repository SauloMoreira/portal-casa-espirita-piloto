
-- 1. ia_queixas
CREATE TABLE public.ia_queixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_queixa text NOT NULL,
  categoria text NOT NULL DEFAULT 'geral',
  descricao text,
  palavras_chave text[] DEFAULT '{}',
  sinonimos text[] DEFAULT '{}',
  nivel_relevancia text NOT NULL DEFAULT 'media',
  observacoes text,
  status text NOT NULL DEFAULT 'ativo',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_queixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ia_queixas" ON public.ia_queixas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entrevistadores read ia_queixas" ON public.ia_queixas FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role));

CREATE TRIGGER update_ia_queixas_updated_at BEFORE UPDATE ON public.ia_queixas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. ia_queixa_tratamento
CREATE TABLE public.ia_queixa_tratamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queixa_id uuid NOT NULL REFERENCES public.ia_queixas(id) ON DELETE CASCADE,
  tratamento_id uuid NOT NULL REFERENCES public.tipos_tratamento(id) ON DELETE CASCADE,
  prioridade text NOT NULL DEFAULT 'media',
  peso integer NOT NULL DEFAULT 5,
  tipo_relacao text NOT NULL DEFAULT 'principal',
  observacao_operacional text,
  observacao_doutrinaria text,
  status text NOT NULL DEFAULT 'ativo',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_queixa_tratamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ia_queixa_tratamento" ON public.ia_queixa_tratamento FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entrevistadores read ia_queixa_tratamento" ON public.ia_queixa_tratamento FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role));

CREATE TRIGGER update_ia_queixa_tratamento_updated_at BEFORE UPDATE ON public.ia_queixa_tratamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. ia_biblioteca
CREATE TABLE public.ia_biblioteca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  autor text,
  tipo_material text NOT NULL DEFAULT 'livro',
  tema text NOT NULL DEFAULT 'geral',
  subtitulos text,
  resumo text,
  arquivo_url text,
  texto_indexavel text,
  usar_na_ia boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ativo',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_biblioteca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ia_biblioteca" ON public.ia_biblioteca FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entrevistadores read ia_biblioteca" ON public.ia_biblioteca FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role));

CREATE TRIGGER update_ia_biblioteca_updated_at BEFORE UPDATE ON public.ia_biblioteca
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. ia_biblioteca_relacoes
CREATE TABLE public.ia_biblioteca_relacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.ia_biblioteca(id) ON DELETE CASCADE,
  queixa_id uuid REFERENCES public.ia_queixas(id) ON DELETE CASCADE,
  tratamento_id uuid REFERENCES public.tipos_tratamento(id) ON DELETE CASCADE,
  tipo_relacao text NOT NULL DEFAULT 'referencia',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_biblioteca_relacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ia_biblioteca_relacoes" ON public.ia_biblioteca_relacoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entrevistadores read ia_biblioteca_relacoes" ON public.ia_biblioteca_relacoes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role));

-- 5. ia_sugestoes
CREATE TABLE public.ia_sugestoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrevista_id uuid REFERENCES public.entrevistas_fraternas(id) ON DELETE SET NULL,
  assistido_id uuid NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  entrevistador_id uuid NOT NULL,
  resumo_ia text,
  queixas_identificadas_json jsonb DEFAULT '[]',
  tratamentos_sugeridos_json jsonb DEFAULT '[]',
  quantidades_sugeridas_json jsonb DEFAULT '[]',
  justificativa_ia text,
  materiais_consultados_json jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_sugestoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ia_sugestoes" ON public.ia_sugestoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entrevistadores read ia_sugestoes" ON public.ia_sugestoes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role));

CREATE POLICY "Entrevistadores insert ia_sugestoes" ON public.ia_sugestoes FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role));

CREATE TRIGGER update_ia_sugestoes_updated_at BEFORE UPDATE ON public.ia_sugestoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. ia_feedback
CREATE TABLE public.ia_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sugestao_ia_id uuid NOT NULL REFERENCES public.ia_sugestoes(id) ON DELETE CASCADE,
  avaliador_id uuid NOT NULL,
  classificacao text NOT NULL DEFAULT 'pendente',
  sugestao_original_json jsonb,
  atribuicao_final_json jsonb,
  diferencas_json jsonb,
  motivo_ajuste text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ia_feedback" ON public.ia_feedback FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entrevistadores read ia_feedback" ON public.ia_feedback FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role));

CREATE POLICY "Entrevistadores insert ia_feedback" ON public.ia_feedback FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role));

CREATE TRIGGER update_ia_feedback_updated_at BEFORE UPDATE ON public.ia_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. ia_configuracoes
CREATE TABLE public.ia_configuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usar_base_doutrinaria boolean NOT NULL DEFAULT true,
  usar_base_operacional boolean NOT NULL DEFAULT true,
  usar_historico_supervisionado boolean NOT NULL DEFAULT false,
  peso_base_doutrinaria integer NOT NULL DEFAULT 5,
  peso_base_operacional integer NOT NULL DEFAULT 7,
  peso_historico integer NOT NULL DEFAULT 3,
  exigir_feedback boolean NOT NULL DEFAULT false,
  exibir_justificativa boolean NOT NULL DEFAULT true,
  nivel_confianca_minimo integer NOT NULL DEFAULT 50,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ia_configuracoes" ON public.ia_configuracoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read ia_configuracoes" ON public.ia_configuracoes FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_ia_configuracoes_updated_at BEFORE UPDATE ON public.ia_configuracoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Storage bucket for biblioteca files
INSERT INTO storage.buckets (id, name, public) VALUES ('ia-biblioteca', 'ia-biblioteca', false);

CREATE POLICY "Admins upload ia-biblioteca" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ia-biblioteca' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete ia-biblioteca" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ia-biblioteca' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read ia-biblioteca" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ia-biblioteca');

-- 9. Insert default ia_configuracoes row
INSERT INTO public.ia_configuracoes (id) VALUES (gen_random_uuid());

-- 10. Audit triggers for key tables
CREATE TRIGGER audit_ia_queixas AFTER INSERT OR UPDATE OR DELETE ON public.ia_queixas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER audit_ia_queixa_tratamento AFTER INSERT OR UPDATE OR DELETE ON public.ia_queixa_tratamento
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER audit_ia_biblioteca AFTER INSERT OR UPDATE OR DELETE ON public.ia_biblioteca
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER audit_ia_configuracoes AFTER INSERT OR UPDATE OR DELETE ON public.ia_configuracoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
