ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS imagem_otimizada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imagem_atualizada_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS imagem_atualizada_por uuid;

ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS imagem_otimizada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imagem_atualizada_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS imagem_atualizada_por uuid;