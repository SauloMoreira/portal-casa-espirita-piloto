
-- Add modo_agendamento column
ALTER TABLE public.tipos_tratamento 
ADD COLUMN modo_agendamento text NOT NULL DEFAULT 'sequencial_bloqueante';

-- Backfill based on existing flags
UPDATE public.tipos_tratamento
SET modo_agendamento = CASE
  WHEN tratamento_livre = true THEN 'livre_concomitante'
  WHEN bloqueia_proximo_tratamento = true THEN 'sequencial_bloqueante'
  ELSE 'sequencial_bloqueante'
END;
