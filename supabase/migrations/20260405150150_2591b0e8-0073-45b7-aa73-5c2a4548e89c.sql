
-- Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'entrevistador', 'tarefeiro', 'assistido');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'assistido',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles
CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Configuracoes gerais
CREATE TABLE public.configuracoes_gerais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.configuracoes_gerais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage config" ON public.configuracoes_gerais
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read config" ON public.configuracoes_gerais
  FOR SELECT TO authenticated USING (true);

-- Insert default configs
INSERT INTO public.configuracoes_gerais (chave, valor, descricao) VALUES
  ('quantidade_minima_palestras', '3', 'Quantidade mínima de palestras para habilitar entrevista fraterna'),
  ('permitir_entrevista_livre', 'false', 'Permite agendar entrevistas sem o mínimo de palestras');

-- Assistidos
CREATE TABLE public.assistidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  data_nascimento DATE,
  endereco TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'suspenso')),
  user_id UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.assistidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage assistidos" ON public.assistidos
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Entrevistadores manage assistidos" ON public.assistidos
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'entrevistador'));

CREATE POLICY "Assistido views own record" ON public.assistidos
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Tipos de tratamento
CREATE TABLE public.tipos_tratamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('espiritual', 'holistico')),
  descricao TEXT,
  dia_semana INTEGER CHECK (dia_semana BETWEEN 0 AND 6),
  horario TIME,
  frequencia_valor INTEGER DEFAULT 1,
  frequencia_unidade TEXT DEFAULT 'semanas' CHECK (frequencia_unidade IN ('dias', 'semanas', 'meses')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tipos_tratamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tratamentos" ON public.tipos_tratamento
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read tratamentos" ON public.tipos_tratamento
  FOR SELECT TO authenticated USING (true);

-- Palestras
CREATE TABLE public.palestras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  tema TEXT,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.palestras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage palestras" ON public.palestras
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read palestras" ON public.palestras
  FOR SELECT TO authenticated USING (true);

-- Presenças em palestras
CREATE TABLE public.presencas_palestras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id UUID REFERENCES public.assistidos(id) ON DELETE CASCADE NOT NULL,
  palestra_id UUID REFERENCES public.palestras(id) ON DELETE CASCADE NOT NULL,
  presente BOOLEAN NOT NULL DEFAULT true,
  registrado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assistido_id, palestra_id)
);
ALTER TABLE public.presencas_palestras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage presencas_palestras" ON public.presencas_palestras
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Entrevistadores manage presencas_palestras" ON public.presencas_palestras
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'entrevistador'));

CREATE POLICY "Assistido views own presencas_palestras" ON public.presencas_palestras
  FOR SELECT TO authenticated
  USING (assistido_id IN (SELECT id FROM public.assistidos WHERE user_id = auth.uid()));

-- Entrevistas fraternas
CREATE TABLE public.entrevistas_fraternas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id UUID REFERENCES public.assistidos(id) ON DELETE CASCADE NOT NULL,
  entrevistador_id UUID REFERENCES auth.users(id) NOT NULL,
  data TIMESTAMPTZ NOT NULL,
  tipo_entrevista TEXT NOT NULL DEFAULT 'regular' CHECK (tipo_entrevista IN ('regular', 'livre')),
  observacoes TEXT,
  decisoes TEXT,
  status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'realizada', 'cancelada', 'remarcada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.entrevistas_fraternas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage entrevistas" ON public.entrevistas_fraternas
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Entrevistadores manage own entrevistas" ON public.entrevistas_fraternas
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'entrevistador')
  );

CREATE POLICY "Assistido views own entrevistas" ON public.entrevistas_fraternas
  FOR SELECT TO authenticated
  USING (assistido_id IN (SELECT id FROM public.assistidos WHERE user_id = auth.uid()));

-- Vínculo assistido-tratamento
CREATE TABLE public.assistido_tratamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id UUID REFERENCES public.assistidos(id) ON DELETE CASCADE NOT NULL,
  tratamento_id UUID REFERENCES public.tipos_tratamento(id) ON DELETE CASCADE NOT NULL,
  entrevista_id UUID REFERENCES public.entrevistas_fraternas(id),
  quantidade_total INTEGER NOT NULL DEFAULT 1,
  quantidade_realizada INTEGER NOT NULL DEFAULT 0,
  quantidade_faltante INTEGER GENERATED ALWAYS AS (GREATEST(quantidade_total - quantidade_realizada, 0)) STORED,
  data_inicio DATE,
  status TEXT NOT NULL DEFAULT 'aguardando_inicio' CHECK (status IN ('aguardando_inicio', 'em_andamento', 'concluido', 'suspenso', 'cancelado')),
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assistido_tratamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage assistido_tratamentos" ON public.assistido_tratamentos
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Entrevistadores manage assistido_tratamentos" ON public.assistido_tratamentos
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'entrevistador'));

CREATE POLICY "Tarefeiros read assistido_tratamentos" ON public.assistido_tratamentos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'tarefeiro'));

CREATE POLICY "Assistido views own tratamentos" ON public.assistido_tratamentos
  FOR SELECT TO authenticated
  USING (assistido_id IN (SELECT id FROM public.assistidos WHERE user_id = auth.uid()));

-- Presenças em tratamentos
CREATE TABLE public.presencas_tratamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_tratamento_id UUID REFERENCES public.assistido_tratamentos(id) ON DELETE CASCADE NOT NULL,
  data DATE NOT NULL,
  status_presenca TEXT NOT NULL DEFAULT 'presente' CHECK (status_presenca IN ('presente', 'ausente', 'justificado')),
  registrado_por UUID REFERENCES auth.users(id) NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.presencas_tratamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage presencas_tratamentos" ON public.presencas_tratamentos
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tarefeiros manage presencas" ON public.presencas_tratamentos
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'tarefeiro'));

CREATE POLICY "Assistido views own presencas" ON public.presencas_tratamentos
  FOR SELECT TO authenticated
  USING (assistido_tratamento_id IN (
    SELECT at.id FROM public.assistido_tratamentos at
    JOIN public.assistidos a ON a.id = at.assistido_id
    WHERE a.user_id = auth.uid()
  ));

-- Orientações ao assistido
CREATE TABLE public.orientacoes_assistido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id UUID REFERENCES public.assistidos(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  visivel_assistido BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orientacoes_assistido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage orientacoes" ON public.orientacoes_assistido
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Entrevistadores manage orientacoes" ON public.orientacoes_assistido
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'entrevistador'));

CREATE POLICY "Assistido views own orientacoes" ON public.orientacoes_assistido
  FOR SELECT TO authenticated
  USING (
    visivel_assistido = true
    AND assistido_id IN (SELECT id FROM public.assistidos WHERE user_id = auth.uid())
  );

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  acao TEXT NOT NULL,
  tabela TEXT NOT NULL,
  registro_id UUID,
  dados_anteriores JSONB,
  dados_novos JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System inserts audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assistidos_updated_at BEFORE UPDATE ON public.assistidos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tipos_tratamento_updated_at BEFORE UPDATE ON public.tipos_tratamento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_entrevistas_fraternas_updated_at BEFORE UPDATE ON public.entrevistas_fraternas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assistido_tratamentos_updated_at BEFORE UPDATE ON public.assistido_tratamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_assistidos_status ON public.assistidos(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_assistidos_user_id ON public.assistidos(user_id);
CREATE INDEX idx_assistido_tratamentos_assistido ON public.assistido_tratamentos(assistido_id);
CREATE INDEX idx_assistido_tratamentos_status ON public.assistido_tratamentos(status);
CREATE INDEX idx_presencas_tratamentos_data ON public.presencas_tratamentos(data);
CREATE INDEX idx_entrevistas_data ON public.entrevistas_fraternas(data);
CREATE INDEX idx_entrevistas_status ON public.entrevistas_fraternas(status);
CREATE INDEX idx_audit_logs_tabela ON public.audit_logs(tabela, created_at);
