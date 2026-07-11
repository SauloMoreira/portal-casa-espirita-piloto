CREATE POLICY "Coordenador reads assistidos of coordinated tratamentos"
ON public.assistidos FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.assistido_tratamentos at
    WHERE at.assistido_id = assistidos.id
      AND at.tratamento_id IN (SELECT public.fn_tratamentos_do_coordenador(auth.uid()))
  )
);