-- Add priority fields to assistido_tratamentos
ALTER TABLE public.assistido_tratamentos 
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS urgencia text NULL;

-- Index for faster waitlist queries
CREATE INDEX IF NOT EXISTS idx_assistido_tratamentos_prioridade 
  ON public.assistido_tratamentos (prioridade, status);
