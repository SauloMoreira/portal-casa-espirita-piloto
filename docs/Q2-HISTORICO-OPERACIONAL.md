# Histórico Operacional — Frentes Q2 (Tratamentos FER)

> Documento de fechamento formal das frentes funcionais do ciclo Q2.
> Não reabrir frentes marcadas como **encerradas**.

---

## Ciclo Q2-A — IA na Entrevista Fraterna
- **Status:** ✅ Encerrado formalmente
- **Escopo:** Diagnóstico e ajustes na frente inicial da IA na entrevista fraterna.
- **Decisão:** Encerrado conforme aprovação do responsável.

---

## Ciclo Q2-B — Qualidade Operacional da Agenda e Presença
- **Status:** ✅ Encerrado formalmente
- **Escopo:** Diagnóstico de qualidade operacional da agenda, presença, falta, conclusão, carga e relatórios.
- **Entregas aprovadas:**
  - **Q2-B1** — Correção da carga operacional e saneamento pontual de agenda residual (carga do tarefeiro contemplando modelo legado + novo modelo com deduplicação; saneamento de sessão residual).
- **Conclusão:** Fluxo operacional consistente após Q2-B1, sem risco crítico, alto ou médio remanescente.
- **Decisão:** Encerrado conforme aprovação do responsável.

---

## Ciclo Q2-C — Comunicação, Avisos e Notificações Operacionais
- **Status:** ✅ Encerrado formalmente (diagnóstico + Q2-C1)
- **Escopo:** Diagnóstico de comunicação, avisos e notificações operacionais; saneamento pontual da fila.

### Q2-C1 — Saneamento pontual e auditado da fila
- **Status:** ✅ Concluído e aprovado
- **Recorte executado:**
  - 19 itens `sem_telefone` em `falha` foram encerrados como `cancelado` / `erro='erro_cadastro'` via RPC `fn_encerrar_item_fila_erro_cadastro`, em lote idempotente.
  - A fila passou de 441 para 460 itens `cancelados`.
- **Auditoria:** 19 registros `encerrar_item_fila_erro_cadastro` gerados em `audit_logs`.
- **Idempotência:** Predicado filtra `status='falha'` + motivo de cadastro; reexecução seleciona 0 itens — provado em teste.
- **Garantias preservadas:**
  - Sem bloqueio de assistido.
  - Sem alteração de opt-out, consentimento ou preferências.
  - Sem reenvio (`sent_at` permanece nulo).
  - Sem alteração de schema, tabelas, RLS, policies, grants, edge functions, dispatchers, provider ou templates.
- **Testes:**
  - `src/test/integration/db/q2c1-saneamento-fila-erro-cadastro.dbtest.ts` — 7 testes verdes.
  - Suíte relacionada (notificações, fila, elegibilidade, avisos, consentimento) — 169 testes verdes.
  - `tsgo` limpo, exit 0.
- **Indicadores preservados:** `0028 = 0`, `0025 = 0`, `0029 = 56` inalterados.
- **Árvore de trabalho:** Limpa (apenas teste novo + migração de dados aplicada).
- **Arquivos alterados:**
  - `src/test/integration/db/q2c1-saneamento-fila-erro-cadastro.dbtest.ts`
  - `supabase/migrations/20260707011829_a550ff12-115f-44ce-8443-fe656d417467.sql`

### Pendência registrada fora do escopo Q2-C1
- **Item:** 1 item em `notificacoes_fila` com `status='falha'` e `erro='template_indisponivel'`.
- **Justificativa:** A RPC `fn_encerrar_item_fila_erro_cadastro` aceita apenas motivos de cadastro (`sem_telefone`, `telefone_invalido`, `dados_obrigatorios_ausentes`, `nome_ausente`) e rejeita `template_indisponivel` com `motivo_nao_elegivel`. Como o escopo do Q2-C1 exigia uso exclusivo da RPC e restrição aos itens elegíveis, o item permanece intocado por design.
- **Status:** Pendente para etapa futura específica (não parte do Q2-C1).

---

## Regras de não reabertura
As frentes e subitens abaixo estão formalmente encerrados e não devem ser reabertos:
- S1, P1, Correção complementar pós-P1
- Q1-A1, Q1-A2, Q1-B, Q1-C1..Q1-C7
- Ciclo Q1-C formalmente encerrado
- Ciclo Q2-A formalmente encerrado
- Ciclo Q2-B formalmente encerrado
- Ciclo Q2-C formalmente encerrado (diagnóstico + Q2-C1)
