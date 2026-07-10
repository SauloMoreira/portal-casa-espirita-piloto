-- SAAS-06-C1-FIX09 — Política tenant-aware para admin local operar sessoes_publicas
-- Mesmo padrão adotado em FIX04/FIX08: não depende do GUC app.current_instituicao,
-- pois requisições diretas via PostgREST não setam esse valor. Restrito a
-- admin_instituicao com vínculo ativo na própria instituição.

CREATE POLICY "admin_instituicao gerencia sessoes_publicas do tenant"
ON public.sessoes_publicas
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.fn_is_admin_instituicao(auth.uid(), instituicao_id))
WITH CHECK (public.fn_is_admin_instituicao(auth.uid(), instituicao_id));