
-- SAAS-06-C1-FIX09-GLOBAL — Extensão do padrão "admin_instituicao gerencia X do tenant"
-- para tabelas tenantizadas que ainda dependem apenas do GUC current_instituicao_id().
-- fn_is_admin_instituicao já valida vínculo ATIVO com papel admin_instituicao,
-- então libera CRUD só dentro da própria instituição, sem cross-tenant.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'acao_social_alimentos',
    'avisos_internos',
    'campanhas',
    'comunicacoes_institucionais',
    'configuracoes_gerais',
    'eventos',
    'excecoes_operacionais',
    'palestras',
    'programacao_padrao',
    'regras_operacionais'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'admin_instituicao gerencia ' || t || ' do tenant', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated '
      || 'USING (public.fn_is_admin_instituicao(auth.uid(), instituicao_id)) '
      || 'WITH CHECK (public.fn_is_admin_instituicao(auth.uid(), instituicao_id))',
      'admin_instituicao gerencia ' || t || ' do tenant', t
    );
  END LOOP;
END
$$;
