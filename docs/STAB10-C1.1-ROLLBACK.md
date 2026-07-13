# SAAS-06-C1-STAB10-C1.1 — Rollback (não executado)

Documento operacional. **NÃO executar sem aprovação humana explícita.**

## Precondições obrigatórias

- Só pode ser aplicado **antes do STAB10-C1.2** (rate limit, RPCs, Edge Functions).
- A tabela `public.autocadastro_idempotencia` deve estar vazia
  (`SELECT count(*) FROM public.autocadastro_idempotencia` → 0).
- Nenhuma instituição pode ter `autocadastro_habilitado=true` ou `autocadastro_listado=true`.

## Bloco SQL de rollback

```sql
BEGIN;

-- 1) Reverter índice único institucional do assistido
DROP INDEX IF EXISTS public.ix_assistidos_inst_user_ativo;

-- 2) Remover tabela de idempotência (checagem de vazio primeiro)
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.autocadastro_idempotencia;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK C1.1: tabela contém % registros; abortando', v_n;
  END IF;
END $$;
DROP TABLE IF EXISTS public.autocadastro_idempotencia;

-- 3) Reverter flags institucionais (checagem de tudo desabilitado primeiro)
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.instituicoes
   WHERE autocadastro_habilitado OR autocadastro_listado;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK C1.1: % instituições habilitadas; abortando', v_n;
  END IF;
END $$;
ALTER TABLE public.instituicoes DROP COLUMN IF EXISTS autocadastro_habilitado;
ALTER TABLE public.instituicoes DROP COLUMN IF EXISTS autocadastro_listado;

COMMIT;
```

## Verificação pós-rollback

- `\d public.instituicoes` → ausência das colunas de autocadastro.
- `\dt public.autocadastro_idempotencia` → tabela ausente.
- `SELECT indexname FROM pg_indexes WHERE indexname='ix_assistidos_inst_user_ativo'` → 0 linhas.
- Nenhum registro de `assistidos`, `instituicoes` ou `instituicao_usuarios` alterado.
