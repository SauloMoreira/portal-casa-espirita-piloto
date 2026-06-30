DROP POLICY IF EXISTS "Authenticated read regras" ON public.regras_operacionais;

CREATE POLICY "Authenticated read non-sensitive regras"
  ON public.regras_operacionais
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(sensivel, false) = false
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  );