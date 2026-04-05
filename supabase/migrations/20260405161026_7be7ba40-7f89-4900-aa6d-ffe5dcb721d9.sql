
-- Create agenda_tratamentos_assistido table
CREATE TABLE public.agenda_tratamentos_assistido (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assistido_id UUID NOT NULL REFERENCES public.assistidos(id) ON DELETE CASCADE,
  assistido_tratamento_id UUID NOT NULL REFERENCES public.assistido_tratamentos(id) ON DELETE CASCADE,
  tratamento_id UUID NOT NULL REFERENCES public.tipos_tratamento(id) ON DELETE CASCADE,
  data_sessao DATE NOT NULL,
  horario TIME WITHOUT TIME ZONE,
  status TEXT NOT NULL DEFAULT 'agendado',
  registrado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agenda_tratamentos_assistido ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins manage agenda_tratamentos"
ON public.agenda_tratamentos_assistido FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entrevistadores manage agenda_tratamentos"
ON public.agenda_tratamentos_assistido FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'entrevistador'::app_role));

CREATE POLICY "Tarefeiros read agenda_tratamentos"
ON public.agenda_tratamentos_assistido FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'tarefeiro'::app_role));

CREATE POLICY "Tarefeiros update agenda_tratamentos"
ON public.agenda_tratamentos_assistido FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'tarefeiro'::app_role))
WITH CHECK (has_role(auth.uid(), 'tarefeiro'::app_role));

CREATE POLICY "Assistido views own agenda"
ON public.agenda_tratamentos_assistido FOR SELECT
TO authenticated
USING (assistido_id IN (
  SELECT id FROM public.assistidos WHERE user_id = auth.uid()
));

-- Index for common queries
CREATE INDEX idx_agenda_trat_data ON public.agenda_tratamentos_assistido(data_sessao);
CREATE INDEX idx_agenda_trat_assistido ON public.agenda_tratamentos_assistido(assistido_id);
CREATE INDEX idx_agenda_trat_vinculo ON public.agenda_tratamentos_assistido(assistido_tratamento_id);
CREATE INDEX idx_agenda_trat_tratamento ON public.agenda_tratamentos_assistido(tratamento_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_tratamentos_assistido;
