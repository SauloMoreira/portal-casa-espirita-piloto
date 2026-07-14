# SAAS-06-C1-STAB10-C1.2-B — Rollback documental

Base: `90deae4a1aa3fd410133f8b6575ee98df7078b82`
Escopo: reverter APENAS o que foi introduzido em C1.2-B1 (Edge pública
`signup-assistido-tenant` + fundação persistente de rate-limit).
Não impacta C1.1 (fundação de idempotência) nem C1.2-A (RPCs transacionais
homologadas). Não altera dados reais.

---

## 1) Precondições obrigatórias

Antes de qualquer passo do rollback:

- [ ] Confirmar que a Edge `signup-assistido-tenant` **não** está publicada
      em produção (`supabase functions list` sem a função). Se estiver
      publicada, remover primeiro (passo 2).
- [ ] Confirmar que nenhuma instituição está com `autocadastro_habilitado = true`:
      ```sql
      SELECT count(*) FROM public.instituicoes WHERE autocadastro_habilitado;
      -- esperado: 0
      ```
- [ ] FER Piloto continua `status='implantacao'` e ambas as flags `false`.
- [ ] Nenhuma linha real de operação na tabela de rate-limit
      (todas expiradas ou apenas de teste):
      ```sql
      SELECT count(*) FROM public.autocadastro_rate_limit WHERE expires_at > now();
      -- esperado: 0
      ```
- [ ] R1, R2 e R3-A preservados (`Assistido 03` como nome canônico de R3-A).

Se qualquer precondição falhar, **interromper** o rollback e escalar.

---

## 2) Remoção da Edge Function (operacional, não SQL)

Procedimento operacional Lovable/Supabase, sem migração de banco:

1. Remover o diretório `supabase/functions/signup-assistido-tenant/`
   (contendo `index.ts`, `contract.ts`, `cors.ts`, `rateLimit.ts`,
   `index.test.ts`).
2. Reverter `supabase/config.toml` para conter APENAS `project_id`
   (remover o bloco `[functions.signup-assistido-tenant]`).
3. Se a função houver sido publicada, executar a exclusão via
   `supabase--delete_edge_functions` para o nome `signup-assistido-tenant`.
4. Revogar (rotacionar) os segredos:
   - `AUTOCADASTRO_FINGERPRINT_SECRET`
   - `AUTOCADASTRO_RATE_LIMIT_SECRET`
   - `AUTOCADASTRO_EMAIL_REDIRECT_URL`
   - `AUTOCADASTRO_CORS_ORIGINS`
   - `AUTOCADASTRO_ALLOW_LOCAL`

Nenhum dado do banco é tocado neste passo.

---

## 3) Remoção dos testes e guards

Excluir os arquivos criados na C1.2-B1:

- `src/test/governanca/saas06c1-stab10-c12b-edge-guard.test.ts`
- `src/test/governanca/saas06c1-stab10-c12b-contract.test.ts`
- `src/test/integration/db/saas06c1-stab10-c12b-ratelimit.dbtest.ts`

Nenhuma alteração nos guards/tests de C1.1 ou C1.2-A.

---

## 4) Remoção da RPC e da tabela de rate-limit (SQL cirúrgico)

Executar EM UMA ÚNICA transação, após precheck confirmado:

```sql
BEGIN;

-- 4.1 Precheck defensivo: aborta se houver bucket ativo.
DO $$
DECLARE v_ativos int;
BEGIN
  SELECT count(*) INTO v_ativos
    FROM public.autocadastro_rate_limit
   WHERE expires_at > now();
  IF v_ativos > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTADO: % buckets ativos na tabela de rate-limit', v_ativos;
  END IF;
END $$;

-- 4.2 Remove a RPC pela assinatura EXATA (não usa DROP FUNCTION genérico).
DROP FUNCTION IF EXISTS public.fn_autocadastro_rate_limit_hit(
  text, text, timestamptz, timestamptz
);

-- 4.3 Remove a tabela SEM CASCADE. Se algo depender dela, o rollback aborta.
DROP TABLE IF EXISTS public.autocadastro_rate_limit;

COMMIT;
```

Se o `DROP TABLE` falhar por dependência inesperada, **abortar** o rollback
e investigar — não usar CASCADE.

---

## 5) Tipos gerados

Após remoção do banco, regenerar `src/integrations/supabase/types.ts` para
remover referências a `autocadastro_rate_limit` e
`fn_autocadastro_rate_limit_hit`. Esse arquivo é auto-gerado; não editar à mão.

---

## 6) Preservação garantida

Este rollback:

- **NÃO** modifica `public.instituicoes` (flags C1.1 permanecem).
- **NÃO** modifica `public.autocadastro_idempotencia` (fundação C1.1).
- **NÃO** modifica as quatro RPCs C1.2-A:
  `fn_autocadastro_reservar`, `fn_autocadastro_marcar_auth_criado`,
  `fn_autocadastro_marcar_resultado_falha`, `fn_autocadastro_assistido_publico`.
- **NÃO** apaga ou modifica dados reais (assistidos, profiles, user_roles,
  instituicao_usuarios, audit_logs).
- **NÃO** aciona reversão automática em C1.1/C1.2-A (esses possuem seus
  próprios documentos de rollback dedicados).

---

## 7) Validação pós-rollback

```sql
-- Tabela sumiu
SELECT to_regclass('public.autocadastro_rate_limit'); -- esperado: NULL

-- RPC sumiu
SELECT count(*) FROM pg_proc
 WHERE proname = 'fn_autocadastro_rate_limit_hit'; -- esperado: 0

-- RPCs C1.2-A preservadas
SELECT count(*) FROM pg_proc
 WHERE proname IN (
   'fn_autocadastro_reservar',
   'fn_autocadastro_marcar_auth_criado',
   'fn_autocadastro_marcar_resultado_falha',
   'fn_autocadastro_assistido_publico'
 ); -- esperado: 4

-- FER Piloto preservada
SELECT status, autocadastro_habilitado, autocadastro_listado
  FROM public.instituicoes
 WHERE id = 'e3818702-cfac-47ae-b751-cb6a05babd4f';
-- esperado: ('implantacao', false, false)
```

Rollback concluído somente se todas as verificações acima passarem.
