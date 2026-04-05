
CREATE TABLE public.instituicao_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url text,
  nome_fantasia text NOT NULL,
  razao_social text NOT NULL,
  cnpj text NOT NULL,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  telefone text,
  email_institucional text,
  observacoes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instituicao_config ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins manage instituicao"
  ON public.instituicao_config FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can read (for logo/name display)
CREATE POLICY "Authenticated read instituicao"
  ON public.instituicao_config FOR SELECT
  TO authenticated
  USING (true);

-- Auto-update timestamp
CREATE TRIGGER update_instituicao_updated_at
  BEFORE UPDATE ON public.instituicao_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
