
-- SAAS-06-B0 — Central de Assinaturas (controle comercial manual)
-- Aditivo: novos campos comerciais + classificação da instituição + status "encerrada".
-- Nenhuma mudança em RLS/RPCs além de habilitar UPDATE administrativo para platform_admin
-- (a policy assinaturas_platform_write já filtra por is_platform_admin).

-- 1) Enum: adiciona 'encerrada' de forma idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'saas_assinatura_status' AND e.enumlabel = 'encerrada'
  ) THEN
    ALTER TYPE public.saas_assinatura_status ADD VALUE 'encerrada';
  END IF;
END $$;

-- 2) Classificação comercial da instituição (piloto, produção assistida, cliente ativo, demo).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'saas_classificacao_comercial') THEN
    CREATE TYPE public.saas_classificacao_comercial AS ENUM
      ('demo', 'piloto', 'producao_assistida', 'cliente_ativo');
  END IF;
END $$;

ALTER TABLE public.instituicoes
  ADD COLUMN IF NOT EXISTS classificacao_comercial public.saas_classificacao_comercial
    NOT NULL DEFAULT 'demo';

-- 3) Campos comerciais opcionais em assinaturas (controle manual).
ALTER TABLE public.assinaturas
  ADD COLUMN IF NOT EXISTS valor_mensal_cents integer,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS proximo_vencimento date,
  ADD COLUMN IF NOT EXISTS ultimo_pagamento_em date,
  ADD COLUMN IF NOT EXISTS observacoes_comerciais text,
  ADD COLUMN IF NOT EXISTS condicao_especial text;

-- Trigger de validação leve (evita valores negativos e formas inválidas).
CREATE OR REPLACE FUNCTION public.saas_tg_valida_assinatura_comercial()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.valor_mensal_cents IS NOT NULL AND NEW.valor_mensal_cents < 0 THEN
    RAISE EXCEPTION 'valor_mensal_cents nao pode ser negativo';
  END IF;
  IF NEW.forma_pagamento IS NOT NULL
     AND NEW.forma_pagamento NOT IN ('pix', 'boleto', 'link_manual', 'transferencia', 'outro') THEN
    RAISE EXCEPTION 'forma_pagamento invalida: %', NEW.forma_pagamento;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_assinaturas_valida_comercial ON public.assinaturas;
CREATE TRIGGER tg_assinaturas_valida_comercial
  BEFORE INSERT OR UPDATE ON public.assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.saas_tg_valida_assinatura_comercial();

-- 4) Habilita UPDATE administrativo (RLS ainda restringe a platform_admin).
GRANT UPDATE, INSERT ON public.assinaturas TO authenticated;
GRANT UPDATE ON public.instituicoes TO authenticated;
