-- Tenant scoping para políticas admin em duas tabelas sensíveis.

DROP POLICY IF EXISTS "Admins visualizam fila institucional"
  ON public.comunicacoes_institucionais_envios;

CREATE POLICY "Admins visualizam fila institucional do tenant"
  ON public.comunicacoes_institucionais_envios
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.comunicacoes_institucionais ci
      WHERE ci.id = comunicacoes_institucionais_envios.comunicacao_id
        AND public.fn_is_admin_instituicao(auth.uid(), ci.instituicao_id)
    )
  );

DROP POLICY IF EXISTS "Escopo - admin le tudo"
  ON public.coordenacao_tratamento;

CREATE POLICY "Escopo - admin le no proprio tenant"
  ON public.coordenacao_tratamento
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.instituicao_usuarios iu
      WHERE iu.user_id = coordenacao_tratamento.coordenador_id
        AND public.fn_is_admin_instituicao(auth.uid(), iu.instituicao_id)
    )
  );