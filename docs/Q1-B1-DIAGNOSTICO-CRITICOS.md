# Q1-B1 — Diagnóstico final dos contratos críticos de status

> **Frente:** qualidade técnica / contratos canônicos.
> **Status:** ✅ correção aplicada em **Q1-B2** (ver §6). Diagnóstico original
> mantido para auditoria.
> `SECURITY DEFINER`, guardas S1/P1/Q1-A2.
> Documento somente leitura/auditoria.

---

## 0. Método

- Valores aceitos: lidos de `pg_constraint` (CHECK reais).
- Valores existentes: `GROUP BY status` nas tabelas reais.
- Uso no frontend: varredura completa (`rg`) de constantes e literais.
- Nenhuma função, política, grant ou guarda foi tocada — apenas leitura.

---

## 1. Entrevista — `entrevistas_fraternas.status`

### 1.1 Valores aceitos pelo banco (CHECK `entrevistas_fraternas_status_check`)
`agendada`, `realizada`, `cancelada`, **`remarcada`**.

### 1.2 Valores existentes nos dados atuais
| status | qtd |
|---|---|
| `realizada` | 4 |

Nenhuma linha com `agendada`, `cancelada` ou `remarcada` hoje. `remarcada` é
**estado válido do CHECK porém sem ocorrência atual**.

### 1.3 Onde `ENTREVISTA_STATUS` é usado no frontend
- **Definição:** `src/constants/status.ts:49` (`agendada|realizada|cancelada`)
  + tipo `EntrevistaStatus`.
- **Consumidores reais do `ENTREVISTA_STATUS` canônico:** **nenhum.** Só a
  própria definição e o tipo são referenciados. Nenhum componente importa a
  constante para validar/iterar.
- **Quem realmente rotula `entrevistas_fraternas.status` na UI (já com
  `remarcada`):**
  - `src/constants/dashboard.ts:24` `ENTREVISTA_STATUS_LABELS` +
    `getEntrevistaStatusLabel` → inclui `remarcada`.
  - `src/constants/agenda.ts` (cores + labels + filtro) → inclui `remarcada`.
  - `src/pages/Entrevistas.tsx:106` (label map) → inclui `remarcada`.
  - `src/types/agenda.ts:5` `AgendaEventStatus` → inclui `remarcada`.
- **Falso positivo identificado:** `ENTREVISTA_STATUS_LABELS` em
  `src/constants/fazerEntrevista.ts:11` **não** modela
  `entrevistas_fraternas.status` — modela `assistidos.status`
  (`aguardando_palestras`, `apto_para_entrevista`, `entrevistado`…). Não é
  contrato desta tabela; não entra na correção.

### 1.4 Impacto de incluir `remarcada` em `ENTREVISTA_STATUS`
- **Baixo / cosmético.** As superfícies funcionais (agenda, dashboard, página de
  entrevistas) já tratam `remarcada`. A omissão está apenas na constante
  canônica de `status.ts`, que hoje **não tem consumidor**. Incluir `remarcada`
  apenas alinha o contrato canônico ao CHECK; não muda runtime visível.

### 1.5 `remarcada` é canônico ou legado?
**Canônico.** É valor explícito do CHECK atual, coerente com os eventos de fila
`entrevista_remarcada` / `entrevista_remarcada_por_excecao` e com
`AgendaEventStatus`. Não é resíduo legado.

### 1.6 Classificação
🟠 **Drift real (incompletude do espelho canônico)** — porém de **baixo risco**,
pois o espelho incompleto não tem consumidor ativo.

### 1.7 Proposta de correção segura
- Adicionar `remarcada: "remarcada"` a `ENTREVISTA_STATUS` em
  `src/constants/status.ts`, alinhando ao CHECK (somente frontend, sem schema
  change, sem migração).
- (Opcional, fase Q1-B) consolidar os 3 label-maps duplicados
  (`dashboard.ts`, `agenda.ts`, `Entrevistas.tsx`) numa única fonte derivada de
  `ENTREVISTA_STATUS`. Fora do escopo do diagnóstico.

---

## 2. Vínculo de tratamento — `assistido_tratamentos.status`

### 2.1 Valores aceitos pelo banco (CHECK `assistido_tratamentos_status_check`)
`aguardando_inicio`, `aguardando_liberacao`, `aguardando_agendamento`,
`liberado`, `em_andamento`, `concluido`, `suspenso`, `cancelado` (8 valores).

### 2.2 Valores existentes nos dados atuais
| status | qtd |
|---|---|
| `aguardando_inicio` | 41 |
| `em_andamento` | 9 |
| `concluido` | 7 |
| `aguardando_agendamento` | 5 |

Todos pertencem ao CHECK. **Nenhum dado** com `ativo` ou `pausado` (valores que
o frontend `VINCULO_STATUS` inventa). Confirma que `ativo`/`pausado` **não
existem** no domínio real.

### 2.3 Onde `VINCULO_STATUS` é usado no frontend
- **Definição:** `src/constants/status.ts:7`
  (`aguardando_liberacao|ativo|pausado|concluido|cancelado`) + tipo
  `VinculoStatus`.
- **Consumidores reais do `VINCULO_STATUS` canônico:** **nenhum.** Apenas a
  definição e o tipo. Nenhuma tela importa/usa.
- **Quem realmente lê/escreve `assistido_tratamentos.status` (com os valores
  reais do banco):**
  - `src/constants/fazerEntrevista.ts:32` `VINCULO_STATUS_RESETAVEL`
    (`aguardando_inicio`, `aguardando_liberacao`, `aguardando_agendamento`) —
    valores **corretos** do CHECK.
  - `src/services/entrevistas/fazerEntrevista.ts:94,125` usa
    `VINCULO_STATUS_RESETAVEL`.
  - Literais coerentes com o CHECK em `src/lib/agendaRules.ts`,
    `src/services/agendaPlano/orquestracao.ts`, relatórios e migração de legado.

### 2.4 `VINCULO_STATUS` é canônico, abstração ou legado?
**Não é o contrato do banco.** É uma **constante legada/abstração de UI
abandonada** que nunca foi alinhada ao CHECK e **não tem nenhum consumidor**.
Não há mapeamento intencional `8 valores DB → rótulos reduzidos`: `ativo` e
`pausado` simplesmente não existem no domínio, e 4 estados reais
(`aguardando_inicio`, `aguardando_agendamento`, `liberado`, `em_andamento`,
`suspenso`) ficaram de fora.

### 2.5 Natureza da divergência (pergunta explícita do Q1-B1)
- ❌ não é abstração intencional (não há mapeamento DB↔UI em uso)
- ❌ não é coexistência de dois contratos ativos
- ✅ **é legado / espelho morto + drift real** — a constante diverge do banco e
  está órfã. O contrato real do domínio já é exercido por literais e por
  `VINCULO_STATUS_RESETAVEL`.

### 2.6 Risco de corrigir diretamente
- **Baixo**, porque `VINCULO_STATUS` não tem consumidor: redefini-la para os 8
  valores reais não quebra nenhuma tela.
- **Atenção:** o nome `VINCULO_STATUS` pode induzir uso futuro errado; a correção
  deve substituí-la pelo conjunto canônico real e adicionar trava de paridade
  contra o CHECK para impedir regressão.

### 2.7 Classificação
🔴 **Crítico → confirmado como legado/espelho morto + drift real** (não é
abstração intencional). Precisa correção, com risco de implementação baixo dada
a ausência de consumidores.

### 2.8 Proposta de correção segura
- Redefinir `VINCULO_STATUS` em `src/constants/status.ts` para os **8 valores
  reais** do CHECK (somente frontend, sem migração).
- Manter `VINCULO_STATUS_RESETAVEL` como subconjunto derivado dos canônicos.
- Adicionar teste de paridade real (CHECK × constante) em
  `src/test/integration/db`.
- Sem schema change, sem tocar `SECURITY DEFINER`/RLS/grants.

---

## 3. Testes necessários (para a fase de correção Q1-B2, ainda não criados)

- **Puro (`src/test/governanca`):**
  - `ENTREVISTA_STATUS` ⊇ {agendada, realizada, cancelada, remarcada}.
  - `VINCULO_STATUS` == conjunto canônico dos 8 valores.
  - `VINCULO_STATUS_RESETAVEL ⊂ VINCULO_STATUS`.
- **Integração real (`npm run test:db`, `src/test/integration/db`):**
  - paridade `entrevistas_fraternas_status_check` × `ENTREVISTA_STATUS`.
  - paridade `assistido_tratamentos_status_check` × `VINCULO_STATUS`.

---

## 4. Resumo executivo

| Contrato | Natureza | Classificação | Correção |
|---|---|---|---|
| `entrevistas_fraternas.status` × `ENTREVISTA_STATUS` | espelho canônico incompleto (sem consumidor); `remarcada` é canônico | drift real, baixo risco | adicionar `remarcada` à constante |
| `assistido_tratamentos.status` × `VINCULO_STATUS` | espelho **morto/legado**, divergente, sem consumidor; `ativo`/`pausado` inexistentes no banco/dados | legado + drift real (não abstração intencional) | redefinir constante para os 8 valores reais + teste de paridade |

---

## 5. Confirmação de não-alteração

Nesta etapa (apenas diagnóstico), **nada** foi alterado:
- RLS — inalterada.
- grants/revokes — inalterados.
- `SECURITY DEFINER` — inalterado (apenas leitura de `pg_constraint` e dados).
- guardas S1/P1/Q1-A2 — inalteradas.
- Runtime/frontend — sem mudança.
- Métricas de segurança mantidas: **0028=0, 0025=0, 0029=56**.

> Próximo passo só após aprovação: Q1-B2 (correção das duas constantes +
> testes de paridade), sem schema change e sem tocar segurança.
