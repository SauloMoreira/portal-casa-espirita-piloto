-- SAAS-06-B0.3 — Habilitação de módulos por instituição/assinatura
-- Permite ao platform_admin ligar/desligar módulos de uma assinatura,
-- sobrepondo pontualmente a composição herdada do plano.
-- Semântica: se existir linha em assinatura_modulos para (assinatura_id, modulo_id),
-- o valor `ativo` prevalece sobre `plano_modulos.ativo`. Caso contrário,
-- vale o que o plano definir.

CREATE TABLE IF NOT EXISTS public.assinatura_modulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id UUID NOT NULL REFERENCES public.assinaturas(id) ON DELETE CASCADE,
  modulo_id UUID NOT NULL REFERENCES public.modulos(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (assinatura_id, modulo_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinatura_modulos TO authenticated;
GRANT ALL ON public.assinatura_modulos TO service_role;

ALTER TABLE public.assinatura_modulos ENABLE ROW LEVEL SECURITY;

-- Leitura: platform_admin vê tudo; usuários do tenant veem apenas da sua instituição.
DROP POLICY IF EXISTS assinatura_modulos_read ON public.assinatura_modulos;
CREATE POLICY assinatura_modulos_read
ON public.assinatura_modulos
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.assinaturas a
    JOIN public.instituicao_usuarios iu
      ON iu.instituicao_id = a.instituicao_id
    WHERE a.id = assinatura_modulos.assinatura_id
      AND iu.user_id = auth.uid()
      AND iu.status = 'ativo'
  )
);

-- Escrita: apenas platform_admin.
DROP POLICY IF EXISTS assinatura_modulos_platform_write ON public.assinatura_modulos;
CREATE POLICY assinatura_modulos_platform_write
ON public.assinatura_modulos
FOR ALL
TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- Trigger updated_at.
CREATE OR REPLACE FUNCTION public.tg_assinatura_modulos_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assinatura_modulos_touch ON public.assinatura_modulos;
CREATE TRIGGER trg_assinatura_modulos_touch
BEFORE UPDATE ON public.assinatura_modulos
FOR EACH ROW EXECUTE FUNCTION public.tg_assinatura_modulos_touch();

CREATE INDEX IF NOT EXISTS idx_assinatura_modulos_assinatura
  ON public.assinatura_modulos (assinatura_id);