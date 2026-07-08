
-- SAAS-05-F3 — Cutover técnico multi-tenant (projeto SaaS)
-- Pré-check + NOT NULL nas 13 T-DIR + remoção de policies legadas cross-tenant.
-- Preserva shadow policies (tenant-scoped) como regras efetivas finais.

DO $saas05f3_precheck$
DECLARE
  v_nulls int := 0;
  v_tab text;
  v_count int;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY[
    'assistidos','voluntarios','palestras','sessoes_publicas','avisos_internos',
    'campanhas','eventos','acao_social_alimentos','regras_operacionais',
    'excecoes_operacionais','programacao_padrao','configuracoes_gerais',
    'comunicacoes_institucionais'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE instituicao_id IS NULL', v_tab)
      INTO v_count;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'SAAS-05-F3 abortado: % linhas sem instituicao_id em public.%', v_count, v_tab;
    END IF;
    v_nulls := v_nulls + v_count;
  END LOOP;
  RAISE NOTICE 'SAAS-05-F3 pré-check OK — 0 nulls em 13 T-DIR.';
END
$saas05f3_precheck$;

-- ============================================================
-- 1) NOT NULL nas 13 T-DIR (idempotente via SET NOT NULL)
-- ============================================================
ALTER TABLE public.assistidos                  ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.voluntarios                 ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.palestras                   ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.sessoes_publicas            ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.avisos_internos             ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.campanhas                   ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.eventos                     ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.acao_social_alimentos       ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.regras_operacionais         ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.excecoes_operacionais       ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.programacao_padrao          ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.configuracoes_gerais        ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.comunicacoes_institucionais ALTER COLUMN instituicao_id SET NOT NULL;

-- ============================================================
-- 2) REMOÇÃO DE POLICIES LEGADAS OR-combinadas (has_role-only)
-- Resolve findings S4: F1 (assistidos/voluntarios PII cross-tenant),
-- F2 (comunicacoes_institucionais admin unscoped), F3 (has_role-only).
-- Shadow policies (tenant-scoped) permanecem como regra final efetiva.
-- Policies de autoacesso (user_id = auth.uid()) são preservadas.
-- ============================================================

-- acao_social_alimentos
DROP POLICY IF EXISTS "Admins gerenciam alimentos (delete)"       ON public.acao_social_alimentos;
DROP POLICY IF EXISTS "Admins gerenciam alimentos (insert)"       ON public.acao_social_alimentos;
DROP POLICY IF EXISTS "Admins gerenciam alimentos (update)"       ON public.acao_social_alimentos;
DROP POLICY IF EXISTS "Autenticados veem alimentos ativos"        ON public.acao_social_alimentos;

-- assistidos (preserva Assistido views/updates own record)
DROP POLICY IF EXISTS "Admins manage assistidos"                             ON public.assistidos;
DROP POLICY IF EXISTS "Coordenador reads assistidos of own tratamentos"      ON public.assistidos;
DROP POLICY IF EXISTS "Entrevistadores manage assistidos"                    ON public.assistidos;
DROP POLICY IF EXISTS "Tarefeiros read assistidos"                           ON public.assistidos;

-- avisos_internos (preserva User views/updates own avisos)
DROP POLICY IF EXISTS "Admins delete avisos"        ON public.avisos_internos;
DROP POLICY IF EXISTS "Admins insert avisos"        ON public.avisos_internos;
DROP POLICY IF EXISTS "Admins read all avisos"      ON public.avisos_internos;
DROP POLICY IF EXISTS "Entrevistadores insert avisos" ON public.avisos_internos;

-- campanhas
DROP POLICY IF EXISTS "Admins gerenciam campanhas (delete)"     ON public.campanhas;
DROP POLICY IF EXISTS "Admins gerenciam campanhas (insert)"     ON public.campanhas;
DROP POLICY IF EXISTS "Admins gerenciam campanhas (update)"     ON public.campanhas;
DROP POLICY IF EXISTS "Autenticados veem campanhas vigentes"    ON public.campanhas;

-- comunicacoes_institucionais (resolve F2)
DROP POLICY IF EXISTS "Admins gerenciam comunicacoes (delete)"  ON public.comunicacoes_institucionais;
DROP POLICY IF EXISTS "Admins gerenciam comunicacoes (insert)"  ON public.comunicacoes_institucionais;
DROP POLICY IF EXISTS "Admins gerenciam comunicacoes (select)"  ON public.comunicacoes_institucionais;
DROP POLICY IF EXISTS "Admins gerenciam comunicacoes (update)"  ON public.comunicacoes_institucionais;

-- configuracoes_gerais
DROP POLICY IF EXISTS "Admins manage config"           ON public.configuracoes_gerais;
DROP POLICY IF EXISTS "Authenticated can read config"  ON public.configuracoes_gerais;

-- eventos
DROP POLICY IF EXISTS "Admins gerenciam eventos (delete)"     ON public.eventos;
DROP POLICY IF EXISTS "Admins gerenciam eventos (insert)"     ON public.eventos;
DROP POLICY IF EXISTS "Admins gerenciam eventos (update)"     ON public.eventos;
DROP POLICY IF EXISTS "Autenticados veem eventos vigentes"    ON public.eventos;

-- excecoes_operacionais
DROP POLICY IF EXISTS "Admin e coordenador gerenciam excecoes - delete" ON public.excecoes_operacionais;
DROP POLICY IF EXISTS "Admin e coordenador gerenciam excecoes - insert" ON public.excecoes_operacionais;
DROP POLICY IF EXISTS "Admin e coordenador gerenciam excecoes - update" ON public.excecoes_operacionais;
DROP POLICY IF EXISTS "Staff podem ver excecoes operacionais"           ON public.excecoes_operacionais;

-- palestras
DROP POLICY IF EXISTS "Admins manage palestras"     ON public.palestras;
DROP POLICY IF EXISTS "Authenticated read palestras" ON public.palestras;

-- programacao_padrao
DROP POLICY IF EXISTS "Admin e coordenador gerenciam programacao - delete" ON public.programacao_padrao;
DROP POLICY IF EXISTS "Admin e coordenador gerenciam programacao - insert" ON public.programacao_padrao;
DROP POLICY IF EXISTS "Admin e coordenador gerenciam programacao - update" ON public.programacao_padrao;
DROP POLICY IF EXISTS "Staff podem ver programacao padrao"                 ON public.programacao_padrao;

-- regras_operacionais
DROP POLICY IF EXISTS "Admins manage regras"                        ON public.regras_operacionais;
DROP POLICY IF EXISTS "Authenticated read non-sensitive regras"     ON public.regras_operacionais;

-- sessoes_publicas
DROP POLICY IF EXISTS "Admins manage sessoes_publicas"    ON public.sessoes_publicas;
DROP POLICY IF EXISTS "Staff read sessoes_publicas"       ON public.sessoes_publicas;
DROP POLICY IF EXISTS "Tarefeiros manage sessoes_publicas" ON public.sessoes_publicas;

-- voluntarios (resolve F1)
DROP POLICY IF EXISTS "Admins manage voluntarios" ON public.voluntarios;

-- ============================================================
-- 3) VERIFICAÇÃO FINAL — cada T-DIR deve manter ao menos 1 policy tenant-scoped.
-- ============================================================
DO $saas05f3_verify$
DECLARE
  v_tab text;
  v_count int;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY[
    'assistidos','voluntarios','palestras','sessoes_publicas','avisos_internos',
    'campanhas','eventos','acao_social_alimentos','regras_operacionais',
    'excecoes_operacionais','programacao_padrao','configuracoes_gerais',
    'comunicacoes_institucionais'
  ] LOOP
    SELECT count(*) INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = v_tab
      AND policyname = 'shadow_tenant_all_' || v_tab;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'SAAS-05-F3: policy tenant-scoped ausente em public.%', v_tab;
    END IF;
  END LOOP;
  RAISE NOTICE 'SAAS-05-F3 concluído — 13 T-DIR com NOT NULL e policies legadas removidas.';
END
$saas05f3_verify$;
