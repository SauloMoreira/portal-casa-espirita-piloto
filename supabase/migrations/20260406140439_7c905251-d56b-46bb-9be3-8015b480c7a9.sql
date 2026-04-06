
CREATE TABLE public.avisos_internos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  destinatario_id UUID NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'geral',
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lido BOOLEAN NOT NULL DEFAULT false,
  lido_em TIMESTAMP WITH TIME ZONE,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.avisos_internos ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_avisos_destinatario ON public.avisos_internos (destinatario_id, lido, created_at DESC);

-- Usuário vê seus próprios avisos
CREATE POLICY "User views own avisos"
ON public.avisos_internos FOR SELECT TO authenticated
USING (destinatario_id = auth.uid());

-- Usuário marca como lido seus próprios avisos
CREATE POLICY "User updates own avisos"
ON public.avisos_internos FOR UPDATE TO authenticated
USING (destinatario_id = auth.uid())
WITH CHECK (destinatario_id = auth.uid());

-- Admins veem todos
CREATE POLICY "Admins read all avisos"
ON public.avisos_internos FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins e entrevistadores podem criar avisos
CREATE POLICY "Admins insert avisos"
ON public.avisos_internos FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Entrevistadores insert avisos"
ON public.avisos_internos FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role));

-- Admins podem deletar
CREATE POLICY "Admins delete avisos"
ON public.avisos_internos FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
