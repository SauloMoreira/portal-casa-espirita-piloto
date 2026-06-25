# CI Gating — Governança Executável

Status: **Fase 1 (observacional) implementada.** Fases 2 e 3 dependem de aprovação após a janela de adoção.

Este documento descreve o gating de CI que torna as suítes de governança, segurança
e integração real em proteção executável no fluxo de merge para `main`.

---

## 1. Objetivo

Impedir que regressões silenciosas cheguem à `main`:

- vazamento/quebra de RLS e acesso por perfil (BUG-03, INV-SEG-004/005);
- quebra de contrato enum/cast no pipeline de notificações (AVM-001, `notif_evento = text`);
- migração/RPC que viole invariante de fila/agenda/presença;
- "merge no vermelho".

Princípio reitor: **fail closed**.

---

## 2. Arquitetura

Um único status agregador — **`gate-summary`** — é o único check destinado a virar
*required* no branch protection (a partir da Fase 2). Ele depende de todos os jobs e
aplica a semântica fail-closed.

```text
              ┌────────────── sempre ──────────────┐
   PR  ──►    │ quality: lint · typecheck · test · build │
              └─────────────────────────────────────┘
              ┌──────── condicional por path ───────┐
              │ test:db        (migração/banco/seg/fila) │
              │ test:e2e:rls   (segurança/RLS)       │
              │ test:e2e       (UI crítica de segurança) │
              └─────────────────────────────────────┘
                              │
                              ▼
                   ┌────────────────────┐
                   │   gate-summary     │  ◄── único required (Fase 2+)
                   └────────────────────┘
```

Detecção de escopo via `dorny/paths-filter` (job `changes`). Filtros são **aditivos**.

---

## 3. Gates por categoria de mudança

| Categoria | Paths | Checks condicionais |
|---|---|---|
| Frontend/backend comum | `src/**` (demais) | apenas `quality` |
| **Migração** | `supabase/migrations/**` | **`test:db` SEMPRE (inegociável)** |
| Banco / config | `supabase/migrations/**`, `supabase/config.toml` | `test:db` |
| Segurança / RLS | migrações, `src/test/e2e-rls/**`, `src/constants/roles.ts`, `supabase/functions/_shared/auth.ts` | `test:db` + `test:e2e:rls` |
| Fila / notificações / dispatch | `src/services/notificacoes/**`, `src/lib/notificac*`, `excecaoNotificacao*`, funções `*dispatch*`/`*alerta*`/`*fila*` | `test:db` |
| Observabilidade / governança | `Observabilidade.tsx`, `services/observabilidade/**`, `lib/observabilidade.ts`, `INVARIANTES.md`, `MATRIZ-EVENTOS-EFEITOS.md` | `quality` (governança) + `test:db` |
| UI crítica (Fase 1, restrita) | `Login.tsx`, `MfaVerify.tsx`, `ResetPassword.tsx`, `ForgotPassword.tsx`, `AuthContext.tsx`, `App.tsx`, `routes.ts`, `e2e/auth-routes.spec.ts` | `test:e2e` |

> **Regra inegociável:** qualquer alteração em `supabase/migrations/**` dispara `test:db`. Sem exceção por filtro frouxo.
>
> **Fase 1 — Playwright contido:** `test:e2e` restrito a autenticação, rotas protegidas e UI crítica diretamente ligada à segurança, para evitar pipeline frágil na entrada.

---

## 4. Sempre × condicional × noturno

- **Sempre (bloqueante):** `quality` = lint, typecheck, test (unit/governança/integração leve), build.
- **Condicional (Fase 1: observacional / Fase 2+: bloqueante quando disparado):** `test:db`, `test:e2e:rls`, `test:e2e`.
- **Noturno (`nightly.yml`, nunca bloqueia PR):** suíte completa sem filtros + todos os pesados; alerta em falha.

---

## 5. Política de bloqueio (semântica do `gate-summary`)

- **success** → ok.
- **failure** → bloqueia (Fase 2+).
- **cancelled** → bloqueia (skip por erro/cancelamento ≠ skip por filtro).
- **skipped por filtro de path** → ok (gate N/A para o escopo do PR).
- **Retry:** 1 re-run permitido para falha *flaky de infra* (rede/banco indisponível). Falha de asserção não se resolve com retry.

### Override auditado — `ci-override-aprovado`

Permitido apenas com regras escritas:

- **nunca** para falha de segurança conhecida;
- **nunca** para falha reproduzível de asserção;
- usar **apenas** em incidente de infra ou urgência operacional crítica;
- **sempre** com justificativa visível no PR;
- **sempre** com rastro de quem aprovou.

O `gate-summary` reconhece a label e emite *warning* visível + registro no resumo.

---

## 6. Performance e custo

- Jobs leves rodam em paralelo; pesados só disparam quando o path é relevante → PR de frontend puro continua rápido.
- Cache de dependências Bun e de browsers Playwright.
- `concurrency` cancela runs supersedidos no mesmo ref.
- `test:db`: serial (`fileParallelism: false`), pool `pg` reusado, `withRollback` por teste.
- `test:e2e:rls`: serial, token/seed reusados por suíte.

---

## 7. Ambiente, seed, cleanup e isolamento

- **Banco de teste dedicado já provisionado** (decisão fechada). Não se provisiona banco efêmero por run nesta fase.
- Credenciais via secrets de CI **separados** dos de runtime:
  - `test:db`: `TEST_PGHOST`, `TEST_PGPORT`, `TEST_PGUSER`, `TEST_PGPASSWORD`, `TEST_PGDATABASE`.
  - `test:e2e:rls`: `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_E2E_RLS_PASSWORD`, `TEST_SERVICE_ROLE_KEY` (service role só no fixture de seed/cleanup).
- **Seed seguro/determinístico**, dados sintéticos sem PII real.
- **Cleanup obrigatório:** `withRollback` (transação revertida) nos testes de banco; seed namespaced (`e2e-rls-*`) com teardown no fixture RLS.
- **Zero side effect operacional:** nenhum dispatch real de WhatsApp/e-mail; nenhuma escrita em filas/tabelas de produção.
- **Logs claros de falha:** guards imprimem `::warning::` quando os secrets do ambiente dedicado estão ausentes (as suítes se auto-pulam via `HAS_DB`/`HAS_E2E`).

---

## 8. Rollout incremental

### Fase 1 — Observação (ATUAL)
- `test:db`, `test:e2e:rls`, `test:e2e` adicionados com `continue-on-error: true`.
- Apenas `quality` é bloqueante (comportamento legado preservado — nada novo tornado bloqueante).
- `gate-summary` ainda **não** é required; apenas reporta.
- **Critério para Fase 2:** 10 PRs **ou** 14 dias corridos (o que vier por último) com os novos jobs verdes e estáveis, sem flaky recorrente não-infra.

### Fase 2 — Bloqueio condicional
- `gate-summary` vira único required no branch protection.
- Remover `continue-on-error` dos condicionais — falham o gate quando disparados.
- Label de override habilitada conforme regras.

### Fase 3 — Gating pleno
- Adicionar checks extras (supabase linter, dependency scan, varredura de findings) ao escopo bloqueante quando maduros.
- Override vira evento raro e revisado.

---

## 9. Critérios de aceite

1. `gate-summary` agrega jobs sempre + condicionais com semântica fail-closed.
2. PR de migração de RLS dispara `test:db` + `test:e2e:rls`; PR de frontend puro não os dispara.
3. Migração sempre dispara `test:db`.
4. Falha de asserção bloqueia (Fase 2+); flaky de infra → 1 retry; skip por filtro não bloqueia; skip por erro/cancelamento bloqueia.
5. Gates pesados isolados, seed determinístico, cleanup garantido, zero side effect.
6. Override só via label auditada, com warning e autor rastreado.
7. Noturno roda suíte completa sem bloquear PRs.
