-- SAAS-06-C1-FIX04: permitir admin_instituicao gerenciar voluntários do próprio tenant
-- sem depender do GUC app.current_instituicao (não é setado em requisições diretas
-- do PostgREST, só em RPCs). Mantém a policy shadow_tenant existente (OR permissivo).
-- Escopo estrito: só admin_instituicao ATIVO no próprio tenant.

CREATE POLICY "admin_instituicao gerencia voluntarios do tenant"
ON public.voluntarios
FOR ALL
TO authenticated
USING (public.fn_is_admin_instituicao(auth.uid(), instituicao_id))
WITH CHECK (public.fn_is_admin_instituicao(auth.uid(), instituicao_id));

COMMENT ON POLICY "admin_instituicao gerencia voluntarios do tenant" ON public.voluntarios IS
  'SAAS-06-C1-FIX04: admin_instituicao ativo pode gerenciar voluntários do próprio tenant via chamadas diretas do PostgREST (a policy shadow_tenant exige GUC app.current_instituicao que só é setado em RPCs SECURITY DEFINER).';
