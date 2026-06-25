# Testes de integração REAL de banco (L-07)

Esta camada complementa — **não substitui** — a suíte de governança em
`src/test/governanca/` (espelhos/lógica pura). Aqui o comportamento é provado na
infraestrutura que realmente executa a regra: triggers, funções SECURITY DEFINER,
auditoria e idempotência reais.

## Como rodar

```bash
npm run test:db
```

Requer as variáveis `PG*` (host/porta/usuário/senha/db) no ambiente. Fora desse
ambiente os testes se auto-pulam (`describe.skip`). **Não** roda no `npm test`/CI
(excluído em `vitest.config.ts`; convenção de nome `*.dbtest.ts`).

## Princípios

- **Isolamento total:** cada teste roda em `withRollback` — uma transação que é
  **sempre revertida**. Triggers e auditoria executam de verdade, são verificados e
  depois descartados. Nenhum efeito persistente, nenhum envio real.
- **Reprodutível:** os dados são descobertos em runtime (papéis, assistidos), sem
  UUID fixo frágil.
- **Autorização realista:** `actAs(client, uid)` define `request.jwt.claims`
  (transação-local), exatamente como o Supabase, de modo que `auth.uid()` e
  `has_role()` dentro das funções resolvem o usuário escolhido.

## Cobertura

| Arquivo | Foco |
| --- | --- |
| `rls-permissoes.dbtest.ts` | Permissão real nas RPCs administrativas + RLS habilitada/políticas presentes |
| `triggers-entrevista.dbtest.ts` | Flag governada de entrevista (ON/OFF), lembrete, date-only |
| `auditoria.dbtest.ts` | Trilha real de parâmetro, presença e entrevista |
| `idempotencia.dbtest.ts` | Barreira `dedupe_key` / `ON CONFLICT DO NOTHING` |
| `presenca-coerencia.dbtest.ts` | `fn_presenca_classificacao` ↔ espelho TS |

## Limites conhecidos

O papel do sandbox tem `BYPASSRLS` e não pode `SET ROLE authenticated`, então o
*enforcement* de RLS por linha não é executável aqui (mitigado por presença de
políticas + checagem de papel nas RPCs + security scanner). Fechar isso exige E2E
via PostgREST com JWT de usuário real. Ver `docs/MAPA-COBERTURA-INVARIANTES.md`.
