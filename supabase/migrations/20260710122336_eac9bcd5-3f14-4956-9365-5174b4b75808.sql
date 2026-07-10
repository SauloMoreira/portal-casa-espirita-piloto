
ALTER TABLE public.sessoes_publicas
  ADD COLUMN IF NOT EXISTS local text,
  ADD COLUMN IF NOT EXISTS capacidade integer,
  ADD COLUMN IF NOT EXISTS observacoes text;

-- Ensure status accepts 'agendada' and 'cancelada' alongside existing values.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.sessoes_publicas'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sessoes_publicas DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.sessoes_publicas
  ADD CONSTRAINT sessoes_publicas_status_check
  CHECK (status IN ('agendada','aberta','encerrada','cancelada'));
