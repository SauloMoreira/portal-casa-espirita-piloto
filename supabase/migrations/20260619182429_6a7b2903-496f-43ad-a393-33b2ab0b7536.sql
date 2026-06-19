ALTER TABLE public.instituicao_config ADD COLUMN IF NOT EXISTS whatsapp text;

UPDATE public.instituicao_config
SET whatsapp = telefone
WHERE whatsapp IS NULL AND telefone IS NOT NULL;