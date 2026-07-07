-- SAAS-05-C: helpers de contexto de tenant + policies multi-tenant shadow.
-- As policies são PERMISSIVAS e coexistem com as policies atuais; portanto,
-- não restringem o acesso atual. Serão ativadas no cutover SAAS-05-F.
--
-- Escopo preservado: nenhuma policy legada é alterada/removida, nenhum RLS
-- enable/disable, nenhum NOT NULL, nenhuma RPC/edge function/UI/dado real.

-- ==== Helpers de contexto de tenant (não SECURITY DEFINER — não tocam tabelas) ====
CREATE OR REPLACE FUNCTION public.current_instituicao_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.current_instituicao', true), '')::uuid;
$$;

-- Padronização de nomes conforme matriz SAAS-05-A
CREATE OR REPLACE FUNCTION public.is_member_of_instituicao(_user_id uuid, _instituicao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.user_pertence_instituicao(_user_id, _instituicao_id);
$$;

CREATE OR REPLACE FUNCTION public.has_role_in_instituicao(_user_id uuid, _instituicao_id uuid, _papel public.saas_papel_local)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.user_tem_papel_local(_user_id, _instituicao_id, _papel);
$$;

-- ==== Grants de segurança sobre os helpers ====
REVOKE EXECUTE ON FUNCTION public.current_instituicao_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_instituicao_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_member_of_instituicao(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member_of_instituicao(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_role_in_instituicao(uuid, uuid, public.saas_papel_local) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_in_instituicao(uuid, uuid, public.saas_papel_local) TO authenticated, service_role;

-- ==== Policies shadow multi-tenant nas 13 tabelas T-DIR base ====
DO $$
DECLARE
  v_tables text[] := ARRAY[
    'assistidos',
    'voluntarios',
    'palestras',
    'sessoes_publicas',
    'avisos_internos',
    'campanhas',
    'eventos',
    'acao_social_alimentos',
    'regras_operacionais',
    'excecoes_operacionais',
    'programacao_padrao',
    'configuracoes_gerais',
    'comunicacoes_institucionais'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    -- Idempotência: recriar a policy shadow se já existir
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'shadow_tenant_all_' || t, t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated
       USING (
         public.is_platform_admin(auth.uid())
         OR (
           public.current_instituicao_id() IS NOT NULL
           AND instituicao_id = public.current_instituicao_id()
           AND public.is_member_of_instituicao(auth.uid(), instituicao_id)
         )
       )
       WITH CHECK (
         public.is_platform_admin(auth.uid())
         OR (
           public.current_instituicao_id() IS NOT NULL
           AND instituicao_id = public.current_instituicao_id()
           AND public.is_member_of_instituicao(auth.uid(), instituicao_id)
         )
       )',
      'shadow_tenant_all_' || t, t
    );
  END LOOP;
END $$;

-- ==== Marcador de rastreabilidade ====
COMMENT ON FUNCTION public.current_instituicao_id() IS 'SAAS-05-C: retorna o tenant ativo do contexto de execução (app.current_instituicao). Usado pelas policies multi-tenant shadow.';
COMMENT ON FUNCTION public.is_member_of_instituicao(uuid, uuid) IS 'SAAS-05-C: wrapper padronizado para public.user_pertence_instituicao.';
COMMENT ON FUNCTION public.has_role_in_instituicao(uuid, uuid, public.saas_papel_local) IS 'SAAS-05-C: wrapper padronizado para public.user_tem_papel_local.';