
-- SAAS-05-B: Tenantização estrutural das tabelas base T-DIR do módulo Tratamentos.
-- Adiciona instituicao_id (nullable), FK para instituicoes(id), backfill idempotente
-- para o tenant demo, e índices. NÃO aplica NOT NULL. NÃO altera RLS/policies.

DO $$
DECLARE
  v_tenant uuid;
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
  -- 1. Tenant inicial: usar instituição demo do SAAS-02 (única existente).
  SELECT id INTO v_tenant FROM public.instituicoes ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'SAAS-05-B: nenhuma instituição encontrada para backfill';
  END IF;

  FOREACH t IN ARRAY v_tables LOOP
    -- 2. Adicionar coluna (idempotente)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS instituicao_id uuid',
      t
    );

    -- 3. FK para instituicoes(id) (idempotente via checagem em pg_constraint)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = format('%s_instituicao_id_fkey', t)
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I
           ADD CONSTRAINT %I
           FOREIGN KEY (instituicao_id) REFERENCES public.instituicoes(id)
           ON DELETE RESTRICT ON UPDATE CASCADE',
        t, format('%s_instituicao_id_fkey', t)
      );
    END IF;

    -- 4. Backfill controlado para tenant inicial (só linhas órfãs)
    EXECUTE format(
      'UPDATE public.%I SET instituicao_id = $1 WHERE instituicao_id IS NULL',
      t
    ) USING v_tenant;

    -- 5. Índice para RLS/consulta futura
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (instituicao_id)',
      format('idx_%s_instituicao_id', t), t
    );
  END LOOP;
END $$;

-- 6. Marcador de recorte para auditoria / rollback rastreável
COMMENT ON COLUMN public.assistidos.instituicao_id IS 'SAAS-05-B: tenant owner. Nullable nesta fase; NOT NULL será aplicado em SAAS-05-F após cutover.';
