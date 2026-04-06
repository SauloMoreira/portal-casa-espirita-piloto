
-- Tabela de regras operacionais configuráveis
CREATE TABLE public.regras_operacionais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.regras_operacionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage regras" ON public.regras_operacionais
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read regras" ON public.regras_operacionais
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_regras_updated_at
  BEFORE UPDATE ON public.regras_operacionais
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir regras padrão
INSERT INTO public.regras_operacionais (chave, valor, descricao) VALUES
  ('limite_faltas_alerta', '3', 'Número de faltas consecutivas para gerar alerta'),
  ('prazo_maximo_espera_dias', '30', 'Dias máximos na lista de espera antes de alerta'),
  ('prazo_reavaliacao_faltas_dias', '7', 'Dias para reavaliação após faltas recorrentes'),
  ('limite_carga_tarefeiro', '20', 'Número máximo de assistidos por tarefeiro antes de alerta'),
  ('alerta_sessao_proxima_horas', '24', 'Horas de antecedência para alerta de sessão próxima'),
  ('retorno_fraterno_pos_conclusao', 'true', 'Exigir retorno fraterno após conclusão de tratamento');

-- Função genérica de auditoria
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
    VALUES (auth.uid(), TG_TABLE_NAME, 'INSERT', NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_anteriores, dados_novos)
    VALUES (auth.uid(), TG_TABLE_NAME, 'UPDATE', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_anteriores)
    VALUES (auth.uid(), TG_TABLE_NAME, 'DELETE', OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Triggers de auditoria nas tabelas críticas
CREATE TRIGGER trg_audit_entrevistas
  AFTER INSERT OR UPDATE OR DELETE ON public.entrevistas_fraternas
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_assistido_tratamentos
  AFTER INSERT OR UPDATE OR DELETE ON public.assistido_tratamentos
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_agenda
  AFTER INSERT OR UPDATE OR DELETE ON public.agenda_tratamentos_assistido
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_presencas
  AFTER INSERT OR UPDATE OR DELETE ON public.presencas_tratamentos
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
