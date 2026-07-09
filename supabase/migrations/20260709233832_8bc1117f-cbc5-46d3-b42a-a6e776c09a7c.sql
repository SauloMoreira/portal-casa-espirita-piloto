-- SAAS-06-C1-FIX08 — Permitir que admin_instituicao gerencie assistidos do tenant
-- Espelha o padrão adotado em FIX04 (voluntarios). A policy shadow_tenant
-- exige GUC app.current_instituicao que não é setado em requests diretos ao
-- PostgREST; fail-closed impedia admins locais de cadastrar assistidos.
CREATE POLICY "admin_instituicao gerencia assistidos do tenant"
ON public.assistidos
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.fn_is_admin_instituicao(auth.uid(), instituicao_id))
WITH CHECK (public.fn_is_admin_instituicao(auth.uid(), instituicao_id));