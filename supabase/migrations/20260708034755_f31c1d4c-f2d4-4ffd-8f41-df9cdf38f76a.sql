
-- SAAS-05-F2 — Backfill defensivo idempotente + seed sintético mínimo (tenant demo).
-- Escopo: preparar cutover (F3) sem virar a chave.
-- Não altera policies, não aplica NOT NULL, não toca RPCs/edges, não migra dados reais.

DO $saas05f2$
DECLARE
  v_demo uuid;
BEGIN
  -- Resolve tenant demo (criado no SAAS-02). Se ausente, aborta silenciosamente
  -- para preservar idempotência em ambientes sem casa demo.
  SELECT id INTO v_demo
  FROM public.instituicoes
  WHERE nome = 'Casa Espírita Demo'
  ORDER BY created_at
  LIMIT 1;

  IF v_demo IS NULL THEN
    RAISE NOTICE 'SAAS-05-F2: tenant demo ausente — migration é no-op.';
    RETURN;
  END IF;

  -- ============================================================
  -- 1) BACKFILL DEFENSIVO — 13 T-DIR
  -- Idempotente: só atualiza registros com instituicao_id IS NULL.
  -- Em sandbox limpo é no-op; em ambientes com legado, atribui ao demo.
  -- ============================================================
  UPDATE public.assistidos                  SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.voluntarios                 SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.palestras                   SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.sessoes_publicas            SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.avisos_internos             SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.campanhas                   SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.eventos                     SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.acao_social_alimentos       SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.regras_operacionais         SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.excecoes_operacionais       SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.programacao_padrao          SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.configuracoes_gerais        SET instituicao_id = v_demo WHERE instituicao_id IS NULL;
  UPDATE public.comunicacoes_institucionais SET instituicao_id = v_demo WHERE instituicao_id IS NULL;

  -- ============================================================
  -- 2) SEED SINTÉTICO MÍNIMO — apenas T-DIR sem FK obrigatória para auth.users
  -- Dados claramente fictícios; nenhum dado real da FER.
  -- Idempotente via WHERE NOT EXISTS por marcador único.
  -- ============================================================

  -- configuracoes_gerais: marcador SAAS-05-F2
  INSERT INTO public.configuracoes_gerais (chave, valor, descricao, instituicao_id)
  SELECT 'saas05_f2_demo_marker', 'seed', 'Marcador sintético SAAS-05-F2 (tenant demo)', v_demo
  WHERE NOT EXISTS (
    SELECT 1 FROM public.configuracoes_gerais
    WHERE chave = 'saas05_f2_demo_marker' AND instituicao_id = v_demo
  );

  -- comunicacoes_institucionais: comunicado demo em rascunho
  INSERT INTO public.comunicacoes_institucionais
    (titulo, mensagem, tipo, publico_criterio, status, instituicao_id)
  SELECT 'SAAS-05-F2 · Comunicado Demo', 'Registro sintético para validação multi-tenant. Não usar em produção.',
         'comunicado', 'consentidos', 'rascunho', v_demo
  WHERE NOT EXISTS (
    SELECT 1 FROM public.comunicacoes_institucionais
    WHERE titulo = 'SAAS-05-F2 · Comunicado Demo' AND instituicao_id = v_demo
  );

  -- palestras: palestra demo fictícia
  INSERT INTO public.palestras (data, tema, observacoes, instituicao_id)
  SELECT DATE '2026-01-01', 'SAAS-05-F2 · Palestra Demo',
         'Registro sintético para validação multi-tenant. Não usar em produção.', v_demo
  WHERE NOT EXISTS (
    SELECT 1 FROM public.palestras
    WHERE tema = 'SAAS-05-F2 · Palestra Demo' AND instituicao_id = v_demo
  );

  RAISE NOTICE 'SAAS-05-F2: backfill+seed aplicados idempotentemente ao tenant demo %.', v_demo;
END
$saas05f2$;
