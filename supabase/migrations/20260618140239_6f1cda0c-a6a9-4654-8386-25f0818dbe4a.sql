ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS revisada_em timestamptz,
  ADD COLUMN IF NOT EXISTS revisada_por uuid;