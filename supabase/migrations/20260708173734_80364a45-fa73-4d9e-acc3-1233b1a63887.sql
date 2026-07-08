-- SAAS-06-B0 (delta): permitir platform_admin criar instituições manualmente
-- pela Central de Assinaturas. Escrita continua fechada por RLS.

GRANT INSERT ON public.instituicoes TO authenticated;

DROP POLICY IF EXISTS instituicoes_platform_insert ON public.instituicoes;
CREATE POLICY instituicoes_platform_insert
  ON public.instituicoes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS instituicoes_platform_update ON public.instituicoes;
CREATE POLICY instituicoes_platform_update
  ON public.instituicoes
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));