# SAAS-06-C1-STAB10-C1.2-A / A1 — Plano de Rollback

Este documento cobre a reversão segura, em ordem, das entregas do backend
transacional interno do autocadastro tenant-aware.

Escopo: apenas RPCs internas de autocadastro e o índice de idempotência.
Nenhum dado de negócio, RLS ou tabela pública é tocado por essas migrations,
portanto o rollback é limpo — não há reconciliação de dados.

---

## Migrations envolvidas

| Ordem | Migration | Descrição |
|-------|-----------|-----------|
| 1 | `20260713194907_..._c12a-core.sql` | RPCs iniciais do autocadastro |
| 2 | `20260713195303_..._c12a-clock.sql` | `updated_at = clock_timestamp()` |
| 3 | `20260713195717_..._c12a-ambig.sql` | Fix ambiguidade de `instituicao_id` |
| 4 | `20260713201922_..._c12a1-hardening.sql` | **A1** – retomada canônica, unique index, ROW_COUNT |
| 5 | `20260713202029_..._c12a1-literais.sql` | **A1** – literais originais restaurados |

Nenhuma Edge Function pública consome ainda essas RPCs — o rollback é seguro
em qualquer momento antes da entrega da Edge Function `signup-assistido-tenant`.

---

## Rollback só do A1 (mais provável)

Se o hardening A1 introduzir regressão, é possível reverter apenas ele
mantendo o backend transacional inicial:

```sql
BEGIN;

-- 1) Devolve a assinatura antiga (4 colunas) da RPC de reserva
DROP FUNCTION IF EXISTS public.fn_autocadastro_reservar(uuid, text, uuid, uuid, timestamptz);
-- (Recolar aqui o corpo original da migration #2 — arquivo
--  20260713195303_..._c12a-clock.sql, seção fn_autocadastro_reservar)

-- 2) Remove o índice único parcial
DROP INDEX IF EXISTS public.ux_autocadastro_idem_user_ativo;

-- 3) Restaura a versão anterior da fn_autocadastro_marcar_auth_criado
--    (com count(*) em vez de unique_violation) — corpo original em #2.

-- 4) Restaura a versão anterior da fn_autocadastro_marcar_resultado_falha
--    (sem GET DIAGNOSTICS) — corpo original em #2.

-- 5) Restaura a versão anterior da fn_autocadastro_assistido_publico
--    (sem GET DIAGNOSTICS na transição de status) — corpo original em #3.

COMMIT;
```

**Pré-condições** antes de executar:
- Nenhuma Edge Function em produção deve estar consumindo o retorno de 5 colunas.
- Zero linhas de idempotência em estado `reservado`/`auth_criado` com `user_id`
  duplicado (o índice sendo removido não deixa resíduo, mas convém validar).

---

## Rollback completo do C1.2-A (remove todas as RPCs)

Só executar se decidirmos abandonar o backend transacional inteiro.

```sql
BEGIN;

DROP INDEX  IF EXISTS public.ux_autocadastro_idem_user_ativo;

DROP FUNCTION IF EXISTS public.fn_autocadastro_assistido_publico(
  uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.fn_autocadastro_marcar_resultado_falha(
  uuid, text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.fn_autocadastro_marcar_auth_criado(
  uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_autocadastro_reservar(
  uuid, text, uuid, uuid, timestamptz);

COMMIT;
```

A tabela `public.autocadastro_idempotencia` NÃO é removida por este rollback
— ela pertence à fundação C1.1 e tem seu próprio plano em
`docs/STAB10-C1.1-ROLLBACK.md`.

---

## Verificação pós-rollback

```sql
-- Nenhuma das RPCs deve existir
SELECT proname FROM pg_proc
 WHERE proname LIKE 'fn_autocadastro_%'
   AND pronamespace = 'public'::regnamespace;

-- Índice A1 removido
SELECT 1 FROM pg_indexes
 WHERE schemaname='public'
   AND indexname='ux_autocadastro_idem_user_ativo';
```

Se tudo correto, executar a suíte `npm run test:db` — os testes de
`autocadastro-c12a.dbtest.ts` devem ser removidos junto ou marcados como
`describe.skip` até a próxima reintrodução.
