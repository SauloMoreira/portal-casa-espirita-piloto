
-- ==== Enums ====
DO $$ BEGIN CREATE TYPE public.saas_instituicao_status AS ENUM ('implantacao','ativa','inativa','suspensa'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.saas_assinatura_status AS ENUM ('trial','ativa','suspensa','cancelada','inadimplente'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.saas_vinculo_status AS ENUM ('pendente','ativo','inativo'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.saas_papel_local AS ENUM ('admin_instituicao','coordenador','entrevistador','tarefeiro','assistido','leitor','caixa','bibliotecario'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.saas_papel_global AS ENUM ('platform_owner','platform_admin','support','billing_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==== platform_admins ====
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel public.saas_papel_global NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, papel)
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id AND papel IN ('platform_owner','platform_admin'))
$$;

CREATE POLICY "platform_admins_self_read" ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "platform_admins_service_all" ON public.platform_admins FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==== instituicoes ====
CREATE TABLE IF NOT EXISTS public.instituicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nome_fantasia text,
  slug text NOT NULL UNIQUE,
  cnpj text,
  email_contato text,
  telefone_contato text,
  cidade text,
  uf text,
  status public.saas_instituicao_status NOT NULL DEFAULT 'implantacao',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instituicoes_status ON public.instituicoes(status);
GRANT SELECT, UPDATE ON public.instituicoes TO authenticated;
GRANT ALL ON public.instituicoes TO service_role;
ALTER TABLE public.instituicoes ENABLE ROW LEVEL SECURITY;

-- ==== instituicao_usuarios ====
CREATE TABLE IF NOT EXISTS public.instituicao_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instituicao_id uuid NOT NULL REFERENCES public.instituicoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel_local public.saas_papel_local NOT NULL,
  status public.saas_vinculo_status NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instituicao_id, user_id, papel_local)
);
CREATE INDEX IF NOT EXISTS idx_inst_usuarios_user_ativo ON public.instituicao_usuarios(user_id) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS idx_inst_usuarios_inst ON public.instituicao_usuarios(instituicao_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instituicao_usuarios TO authenticated;
GRANT ALL ON public.instituicao_usuarios TO service_role;
ALTER TABLE public.instituicao_usuarios ENABLE ROW LEVEL SECURITY;

-- ==== Helpers de tenancy ====
CREATE OR REPLACE FUNCTION public.user_pertence_instituicao(_user_id uuid, _instituicao_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instituicao_usuarios
    WHERE user_id = _user_id AND instituicao_id = _instituicao_id AND status = 'ativo'
  )
$$;

CREATE OR REPLACE FUNCTION public.user_tem_papel_local(_user_id uuid, _instituicao_id uuid, _papel public.saas_papel_local)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instituicao_usuarios
    WHERE user_id = _user_id AND instituicao_id = _instituicao_id
      AND papel_local = _papel AND status = 'ativo'
  )
$$;

CREATE OR REPLACE FUNCTION public.user_is_admin_instituicao(_user_id uuid, _instituicao_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_tem_papel_local(_user_id, _instituicao_id, 'admin_instituicao')
      OR public.is_platform_admin(_user_id)
$$;

-- ==== Policies: instituicoes ====
CREATE POLICY "instituicoes_read_membros" ON public.instituicoes FOR SELECT TO authenticated
  USING (public.user_pertence_instituicao(auth.uid(), id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "instituicoes_admin_local_update" ON public.instituicoes FOR UPDATE TO authenticated
  USING (public.user_is_admin_instituicao(auth.uid(), id))
  WITH CHECK (public.user_is_admin_instituicao(auth.uid(), id));
CREATE POLICY "instituicoes_service_all" ON public.instituicoes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==== Policies: instituicao_usuarios ====
CREATE POLICY "inst_usuarios_self_or_admin_read" ON public.instituicao_usuarios FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_is_admin_instituicao(auth.uid(), instituicao_id)
  );
CREATE POLICY "inst_usuarios_admin_insert" ON public.instituicao_usuarios FOR INSERT TO authenticated
  WITH CHECK (public.user_is_admin_instituicao(auth.uid(), instituicao_id));
CREATE POLICY "inst_usuarios_admin_update" ON public.instituicao_usuarios FOR UPDATE TO authenticated
  USING (public.user_is_admin_instituicao(auth.uid(), instituicao_id))
  WITH CHECK (public.user_is_admin_instituicao(auth.uid(), instituicao_id));
CREATE POLICY "inst_usuarios_admin_delete" ON public.instituicao_usuarios FOR DELETE TO authenticated
  USING (public.user_is_admin_instituicao(auth.uid(), instituicao_id));
CREATE POLICY "inst_usuarios_service_all" ON public.instituicao_usuarios FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==== modulos ====
CREATE TABLE IF NOT EXISTS public.modulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.modulos TO authenticated;
GRANT ALL ON public.modulos TO service_role;
ALTER TABLE public.modulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modulos_read_auth" ON public.modulos FOR SELECT TO authenticated USING (true);
CREATE POLICY "modulos_platform_write" ON public.modulos FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "modulos_service_all" ON public.modulos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==== planos ====
CREATE TABLE IF NOT EXISTS public.planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  valor_mensal numeric(12,2) NOT NULL DEFAULT 0,
  valor_implantacao numeric(12,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.planos TO authenticated;
GRANT ALL ON public.planos TO service_role;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planos_read_auth" ON public.planos FOR SELECT TO authenticated USING (true);
CREATE POLICY "planos_platform_write" ON public.planos FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "planos_service_all" ON public.planos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==== plano_modulos ====
CREATE TABLE IF NOT EXISTS public.plano_modulos (
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  modulo_id uuid NOT NULL REFERENCES public.modulos(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plano_id, modulo_id)
);
GRANT SELECT ON public.plano_modulos TO authenticated;
GRANT ALL ON public.plano_modulos TO service_role;
ALTER TABLE public.plano_modulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plano_modulos_read_auth" ON public.plano_modulos FOR SELECT TO authenticated USING (true);
CREATE POLICY "plano_modulos_platform_write" ON public.plano_modulos FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "plano_modulos_service_all" ON public.plano_modulos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==== assinaturas ====
CREATE TABLE IF NOT EXISTS public.assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instituicao_id uuid NOT NULL REFERENCES public.instituicoes(id) ON DELETE CASCADE,
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE RESTRICT,
  status public.saas_assinatura_status NOT NULL DEFAULT 'trial',
  data_inicio date NOT NULL DEFAULT current_date,
  data_fim date,
  trial_ate date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assinaturas_inst ON public.assinaturas(instituicao_id, status);
GRANT SELECT ON public.assinaturas TO authenticated;
GRANT ALL ON public.assinaturas TO service_role;
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assinaturas_read_membros" ON public.assinaturas FOR SELECT TO authenticated
  USING (public.user_pertence_instituicao(auth.uid(), instituicao_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "assinaturas_platform_write" ON public.assinaturas FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "assinaturas_service_all" ON public.assinaturas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==== Trigger updated_at ====
CREATE OR REPLACE FUNCTION public.saas_tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS tg_instituicoes_touch ON public.instituicoes;
CREATE TRIGGER tg_instituicoes_touch BEFORE UPDATE ON public.instituicoes
  FOR EACH ROW EXECUTE FUNCTION public.saas_tg_touch_updated_at();
DROP TRIGGER IF EXISTS tg_inst_usuarios_touch ON public.instituicao_usuarios;
CREATE TRIGGER tg_inst_usuarios_touch BEFORE UPDATE ON public.instituicao_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.saas_tg_touch_updated_at();
DROP TRIGGER IF EXISTS tg_assinaturas_touch ON public.assinaturas;
CREATE TRIGGER tg_assinaturas_touch BEFORE UPDATE ON public.assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.saas_tg_touch_updated_at();

-- ==== Seed sintético (idempotente) ====
INSERT INTO public.modulos (codigo, nome, descricao) VALUES
  ('tratamentos','Tratamentos','Gestão de assistidos, agenda e tratamentos'),
  ('biblioteca','Biblioteca','Acervo bibliográfico da casa'),
  ('caixa','Caixa','Controle financeiro básico'),
  ('portal','Portal do Assistido','Autoatendimento do assistido')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.planos (codigo, nome, descricao, valor_mensal, valor_implantacao) VALUES
  ('essencial','Essencial','Tratamentos + Portal', 149.00, 0),
  ('fraterno','Fraterno','Essencial + Biblioteca', 249.00, 0),
  ('completo','Completo','Todos os módulos padrão', 349.00, 490.00),
  ('enterprise','Enterprise','Sob medida', 0, 0)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.plano_modulos (plano_id, modulo_id)
SELECT p.id, m.id FROM public.planos p, public.modulos m
WHERE (p.codigo='essencial'  AND m.codigo IN ('tratamentos','portal'))
   OR (p.codigo='fraterno'   AND m.codigo IN ('tratamentos','portal','biblioteca'))
   OR (p.codigo='completo'   AND m.codigo IN ('tratamentos','portal','biblioteca','caixa'))
   OR (p.codigo='enterprise' AND m.codigo IN ('tratamentos','portal','biblioteca','caixa'))
ON CONFLICT DO NOTHING;

INSERT INTO public.instituicoes (nome, nome_fantasia, slug, email_contato, cidade, uf, status)
VALUES ('Casa Espírita Demo','Casa Demo','casa-demo','demo@exemplo.test','São Paulo','SP','ativa')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.assinaturas (instituicao_id, plano_id, status, trial_ate)
SELECT i.id, p.id, 'trial', current_date + INTERVAL '30 days'
FROM public.instituicoes i, public.planos p
WHERE i.slug='casa-demo' AND p.codigo='completo'
  AND NOT EXISTS (SELECT 1 FROM public.assinaturas a WHERE a.instituicao_id = i.id);
