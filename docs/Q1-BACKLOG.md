# Q1 — Contratos canônicos e fechamento de drift frontend/backend (backlog formal)

> Frente de **qualidade técnica / arquitetura**. NÃO altera autorização nem
> regras de segurança já endurecidas em S1/P1.
>
> Diretrizes invioláveis da Q1:
> - não alterar guardas da S1/P1
> - não alterar RLS
> - não flexibilizar permissões
> - não mexer em `SECURITY DEFINER`
> - não mudar comportamento de runtime sem validação prévia
>
> Separação de testes obrigatória:
> - **puros** (CI) → `src/test/governanca` (sem banco vivo)
> - **integração real** (fora do CI, `npm run test:db`) → `src/test/integration/db`

---

## Q1-A1 — Inventário e detecção de roles/enums
- **Status:** ✅ concluído (relatório em `docs/Q1-A1-INVENTARIO.md`)
- **Tipo:** qualidade técnica / arquitetura
- **Runtime:** nenhuma alteração (somente leitura/auditoria)
- **Escopo:** inventariar roles/enums críticos reais; localizar strings soltas;
  localizar fontes duplicadas; mapear contratos DB×TS; propor allowlist;
  identificar riscos reais.
- **Entrega:** relatório nominal dos achados + classificação por risco +
  proposta de correção + proposta de testes bloqueantes.

## Q1-A2 — Consolidação segura de roles/enums
- **Status:** ✅ concluído (validado por `npm run test:db` — 63/63 verdes; paridade `pg_enum` em `q1a2-enums-paridade.dbtest.ts` 2/2)
- **Tipo:** qualidade técnica / contratos canônicos
- **Escopo:** substituir strings soltas por constantes canônicas onde o A1
  classificou como "precisa correção"/"crítico"; criar testes bloqueantes com
  allowlist; adicionar paridade enum/type/check constraint onde for seguro;
  garantir não regressão. Sem tocar guardas/RLS/SECURITY DEFINER.
- **Entregue:**
  - Constantes canônicas `ROLE.*` e `GERENCIAL_ROLES` em `src/constants/roles.ts`.
  - Literais substituídos em `ProtectedRoute.tsx`, `Dashboard.tsx`,
    `Relatorios.tsx` (consumidores de visibilidade/roteamento/view).
  - `notificacoesService.ts` reclassificado como **falso positivo**: as
    ocorrências de `"assistido"` são tipo de autor de mensagem
    (`autor: "assistido" | "ia" | ...`), não papel de acesso — sem alteração.
  - Teste puro `src/test/governanca/q1a2-roles-canonicos.test.ts` (paridade
    `app_role` × types.ts, trava de regressão dos arquivos consolidados,
    allowlist documentada). Teste de banco real
    `src/test/integration/db/q1a2-enums-paridade.dbtest.ts` (paridade `pg_enum`).
  - Nenhuma guarda S1/P1, RLS, permissão, grant/revoke ou `SECURITY DEFINER`
    alterada. `0028=0`, `0025=0`, `0029=56` mantidos.

## Q1-B — Status e estados operacionais
- **Status:** 🟢 em andamento (Q1-B1 diagnóstico ✅ / Q1-B2 correção crítica ✅)
- **Escopo:** presença, fila, diagnóstico, entrevista, aviso de ausência, termo,
  voluntário e vínculo. Tornar contratos `Record<string,string>` tipados quando
  seguro; travar conjuntos contra check constraints reais (testes de integração).

### Q1-B2 — Correção cirúrgica dos contratos críticos de status
- **Status:** ✅ concluído (sem schema change, sem tocar RLS/grants/SECURITY DEFINER)
- **Entregue:**
  - `ENTREVISTA_STATUS` em `src/constants/status.ts` agora inclui `remarcada`
    (alinhado ao CHECK `entrevistas_fraternas_status_check`).
  - `VINCULO_STATUS` redefinido para os **8 valores reais** do CHECK
    `assistido_tratamentos_status_check` (`aguardando_inicio`,
    `aguardando_liberacao`, `aguardando_agendamento`, `liberado`, `em_andamento`,
    `concluido`, `suspenso`, `cancelado`). Removidos os inventados `ativo`/`pausado`.
  - Teste puro `src/test/governanca/q1b2-status-canonicos.test.ts` (paridade de
    conjunto + subconjunto `VINCULO_STATUS_RESETAVEL`).
  - Teste de banco real `src/test/integration/db/q1b2-status-paridade.dbtest.ts`
    (paridade contra CHECK constraints reais via `pg_get_constraintdef`).
  - `npm run test:db` 65/65 verdes; governança pura verde.
  - Nenhuma alteração de runtime, RLS, grants/revokes ou `SECURITY DEFINER`.
    `0028=0`, `0025=0`, `0029=56` mantidos.

## Q1-C — Payloads RPC e espelhos TS
- **Status:** planejado
- **Escopo:** RPCs sensíveis chamadas pelo frontend; tipos de input/output;
  paridade com assinatura SQL / `src/integrations/supabase/types.ts`.

## Q1-D — Documentação e fechamento
- **Status:** planejado
- **Escopo:** `docs/Q1-CANONICAL-CONTRACTS.md`, atualização de
  `docs/INVARIANTES.md` e `docs/MAPA-COBERTURA-INVARIANTES.md`, critério final.
