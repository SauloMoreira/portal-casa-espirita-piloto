DROP POLICY IF EXISTS "Authenticated read sessoes_publicas" ON public.sessoes_publicas;

CREATE POLICY "Staff read sessoes_publicas"
ON public.sessoes_publicas
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'tarefeiro'::app_role)
);