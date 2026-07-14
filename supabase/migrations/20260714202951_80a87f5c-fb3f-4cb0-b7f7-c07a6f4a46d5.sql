-- AÇÃO 1: comunicacoes_institucionais
CREATE POLICY "admin_instituicao gerencia comunicacoes do tenant"
  ON public.comunicacoes_institucionais
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
  );

-- AÇÃO 2: notificacoes_log tenant-aware
CREATE OR REPLACE FUNCTION public.fn_notificacao_log_no_meu_tenant(_fila_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.notificacoes_fila nf
    JOIN public.assistidos a ON a.id = nf.assistido_id
    WHERE nf.id = _fila_id
      AND public.user_pertence_instituicao(auth.uid(), a.instituicao_id)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_notificacao_log_no_meu_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_notificacao_log_no_meu_tenant(uuid) TO authenticated;

DROP POLICY IF EXISTS "Staff read logs" ON public.notificacoes_log;

CREATE POLICY "Staff read logs do tenant" ON public.notificacoes_log
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'))
    AND public.fn_notificacao_log_no_meu_tenant(fila_id)
  );