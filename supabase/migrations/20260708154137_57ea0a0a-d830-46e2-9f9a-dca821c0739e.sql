
-- SAAS-06-A1 — Branding tenant-aware: campos opcionais em instituicao_config.
-- Aditivo, idempotente. Não altera RLS/policies/RPCs.
ALTER TABLE public.instituicao_config
  ADD COLUMN IF NOT EXISTS slogan text,
  ADD COLUMN IF NOT EXISTS cor_primaria text,
  ADD COLUMN IF NOT EXISTS cor_secundaria text,
  ADD COLUMN IF NOT EXISTS texto_institucional text,
  ADD COLUMN IF NOT EXISTS assinatura_rodape text;

-- Seed defensivo do branding demo (apenas se a instituição demo existir e ainda não tiver slogan definido).
DO $$
DECLARE
  v_demo_config_id uuid;
BEGIN
  SELECT ic.id
    INTO v_demo_config_id
  FROM public.instituicao_config ic
  JOIN public.instituicoes i ON i.id = ic.id
  WHERE i.slug = 'casa-demo'
  LIMIT 1;

  IF v_demo_config_id IS NOT NULL THEN
    UPDATE public.instituicao_config
       SET slogan = COALESCE(slogan, 'Ambiente de demonstração'),
           texto_institucional = COALESCE(texto_institucional, 'Tenant demo do Portal Casa Espírita. Sem dados reais.'),
           assinatura_rodape = COALESCE(assinatura_rodape, 'Portal Casa Espírita · Casa Espírita Demo')
     WHERE id = v_demo_config_id;
  END IF;
END $$;
