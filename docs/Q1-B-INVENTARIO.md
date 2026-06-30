# Q1-B — Status e estados operacionais (desenho operacional / inventário)

> **Frente:** qualidade técnica / contratos canônicos.
> **Status:** 🟡 desenho operacional (SEM implementação, SEM alteração de runtime).
> **Diretrizes invioláveis (mantidas):** não alterar RLS, grants/revokes,
> `SECURITY DEFINER`, guardas de RPC já endurecidas (S1/P1/Q1-A2).
> Este documento é somente leitura/auditoria — nenhum identificador técnico foi
> traduzido.

---

## 0. Resumo executivo

Inventário dos contratos de **status/estado operacional** entre banco (fonte da
verdade) e espelhos no frontend. Foram identificados **9 contratos**. Resultado:

| Contrato | Classificação |
|---|---|
| Presença (`presencas_tratamentos.status_presenca`) | ✅ aceitável (espelho consolidado) |
| Fila/notificações (`notif_status`, `notif_evento`, `notif_canal`) | ⚠️ precisa correção (espelho parcial) |
| Diagnóstico de pendência (`fn_fila_diagnostico_pendentes`) | ⚠️ precisa correção (sem espelho tipado) |
| Entrevista (`entrevistas_fraternas.status`) | 🔴 precisa correção (drift: falta `remarcada`) |
| Aviso de ausência (`avisos_ausencia.status`) | ⚠️ precisa correção (sem espelho tipado) |
| Termo de voluntário (`voluntarios.termo_status`) | ✅ aceitável por arquitetura (sem constraint DB) |
| Status de voluntário (`voluntarios.status`) | ✅ aceitável por arquitetura (sem constraint DB) |
| Vínculo de tratamento (`assistido_tratamentos.status`) | 🔴 crítico (drift de conjunto entre DB e `VINCULO_STATUS`) |
| Motivos de inelegibilidade (`fn_fila_motivo_inelegivel`) | ✅ aceitável (espelho documentado) |

Nenhuma correção foi aplicada. Tudo abaixo é proposta para Q1-B (implementação).

---

## 1. Inventário nominal — status/estados reais (fonte da verdade no banco)

### 1.1 Presença — `presencas_tratamentos.status_presenca`
- **Fonte da verdade:** CHECK `presencas_tratamentos_status_presenca_check`
  → `presente`, `ausente`, `justificado`.
- **Semântica operacional geral×operacional:** `fn_presenca_classificacao(text)`.
- **Espelho frontend:** `src/lib/presencaClassificacao.ts`
  (`STATUS_PRESENCA` / `StatusPresenca`), reexportado por
  `src/constants/status.ts` como `PRESENCA_STATUS`.
- **Observação:** `status.ts` já alerta "NÃO usar `falta`/`justificada`".
- **Classificação:** ✅ **aceitável** — espelho único existente + teste de
  paridade real (`presenca-coerencia.dbtest.ts`).

### 1.2 Fila / notificações — enums `notif_status`, `notif_evento`, `notif_canal`
- **Fonte da verdade (pg_enum):**
  - `notif_status`: `pendente, agendado, enviado, falha, cancelado`.
  - `notif_evento`: `entrevista_criada, entrevista_lembrete, sessao_criada,
    sessao_lembrete, remarcacao, cancelamento, presenca_registrada,
    falta_registrada, sessao_cancelada_por_excecao, sessao_remarcada_por_excecao,
    entrevista_cancelada_por_excecao, entrevista_remarcada_por_excecao,
    publico_cancelado_por_excecao, publico_remarcado_por_excecao,
    mensagem_manual, aviso_ausencia_recebido`.
  - `notif_canal`: `whatsapp`.
- **Espelho frontend:** parcial — `EVENTOS_SESSAO` (`sessao_lembrete,
  sessao_criada`) e `AGENDA_STATUS_ELEGIVEL` em
  `src/lib/notificacaoElegibilidade.ts`. **Não há** espelho do conjunto completo
  de `notif_status` nem de `notif_evento`.
- **Classificação:** ⚠️ **precisa correção** — não há contrato TS canônico do
  conjunto completo; risco de string solta em consumidores da Central.

### 1.3 Diagnóstico de pendência — `fn_fila_diagnostico_pendentes()`
- **Fonte da verdade (SECURITY DEFINER, NÃO alterar):** retorna `motivo` ∈
  `agendado_futuro`, `bloqueado_inelegivel:<motivo>`, `opt_out`,
  `comunicacao_geral_desativada`, `sem_telefone`, `aguardando_janela`,
  `aguardando_limite_diario`, `pendente`.
- **Espelho frontend:** consumido pela Central (L-02) sem enum/tipo dedicado.
- **Classificação:** ⚠️ **precisa correção** — criar união tipada read-only
  espelhando exatamente as classes de `motivo` (prefixo `bloqueado_inelegivel:`
  composto). Sem tocar a função.

### 1.4 Entrevista — `entrevistas_fraternas.status`
- **Fonte da verdade:** CHECK `entrevistas_fraternas_status_check`
  → `agendada, realizada, cancelada, **remarcada**`.
- **Espelho frontend:** `ENTREVISTA_STATUS` em `src/constants/status.ts`
  → `agendada, realizada, cancelada` (**falta `remarcada`**).
- **Classificação:** 🔴 **precisa correção** — drift real: o frontend não modela
  `remarcada`, embora o banco permita e a fila trate
  `entrevista_remarcada(_por_excecao)`.

### 1.5 Aviso de ausência — `avisos_ausencia.status`
- **Fonte da verdade:** CHECK `avisos_ausencia_status_check`
  → `aberto, em_tratamento, resolvido, descartado`.
- **Espelho frontend:** usado em `src/pages/AvisosAusencia.tsx` por string solta
  (sem constante canônica dedicada).
- **Classificação:** ⚠️ **precisa correção** — criar contrato tipado +
  allowlist; travar por teste de integração contra o CHECK.

### 1.6 Termo de voluntário — `voluntarios.termo_status`
- **Fonte da verdade:** coluna `text`, default `nao_gerado`, **sem CHECK no
  banco**. Governança real está no frontend.
- **Espelho frontend:** `TERMO_STATUS` + `TERMO_STATUS_LABELS/COLORS` em
  `src/constants/voluntarios.ts`; lógica em `src/lib/termoVoluntario.ts`.
- **Classificação:** ✅ **aceitável por arquitetura** — fonte canônica já é o
  frontend; não há constraint para divergir. (Opcional futuro: CHECK no banco,
  mas **fora do escopo Q1-B** por ser alteração de schema.)

### 1.7 Status de voluntário — `voluntarios.status`
- **Fonte da verdade:** coluna `text`, default `ativo`, **sem CHECK no banco**.
- **Espelho frontend:** `STATUS_LABELS/COLORS` em `src/constants/voluntarios.ts`
  → `ativo, inativo, afastado, desligado`.
- **Classificação:** ✅ **aceitável por arquitetura** — mesma situação do termo.

### 1.8 Vínculo de tratamento — `assistido_tratamentos.status`
- **Fonte da verdade:** CHECK `assistido_tratamentos_status_check`
  → `aguardando_inicio, aguardando_liberacao, aguardando_agendamento, liberado,
  em_andamento, concluido, suspenso, cancelado`.
- **Espelho frontend:** `VINCULO_STATUS` em `src/constants/status.ts`
  → `aguardando_liberacao, ativo, pausado, concluido, cancelado`.
- **Classificação:** 🔴 **crítico** — conjuntos divergentes. `VINCULO_STATUS`
  inclui `ativo`/`pausado` (inexistentes no CHECK) e omite `aguardando_inicio`,
  `aguardando_agendamento`, `liberado`, `em_andamento`, `suspenso`. **Q1-B deve
  apenas mapear/diagnosticar** qual entidade `VINCULO_STATUS` realmente
  representa (pode ser estado derivado de UI, não a coluna do banco) antes de
  qualquer correção — investigação obrigatória, sem runtime change.

### 1.9 Motivos de inelegibilidade — `fn_fila_motivo_inelegivel(uuid)`
- **Fonte da verdade (SECURITY DEFINER, NÃO alterar):** usada por trigger de
  geração, saneamento e dispatch.
- **Espelho frontend:** `MotivoInelegivel` (união) + `MOTIVO_LABEL` em
  `src/lib/notificacaoElegibilidade.ts`.
- **Classificação:** ✅ **aceitável** — espelho documentado e centralizado.
  (Q1-B: adicionar teste de paridade real do conjunto de motivos.)

### 1.10 Contratos correlatos observados (contexto, fora do foco direto)
- `status_etapa_plano` (enum): `prevista, ativa, realizada, ausente, suspensa,
  cancelada, liberada_para_comparecimento_publico` — usado em plano/etapas.
- `assistidos.status` (CHECK, 9 valores), `sessoes_publicas.status`,
  `tipos_tratamento.status`, `handoff_status`, `conversa_status`,
  `admin_promotion_requests.chk_status`, `ia_site_documentos`. Inventariados para
  completude; tratamento detalhado fica para Q1-C/Q1-D se necessário.

---

## 2. Ocorrências de string solta encontradas (resumo)

- `em_andamento`, `aguardando_inicio` etc. aparecem como literais em
  `src/lib/agendaRules*.ts` e respectivos testes (lógica de agenda) — coerentes
  com o CHECK de `assistido_tratamentos`, mas **não** centralizados em constante.
- `aberto/em_tratamento/resolvido/descartado` em `src/pages/AvisosAusencia.tsx`
  como literais.
- Eventos/status de `notif_*` referenciados pontualmente sem enum TS único.
- `migracaoLegado.ts`, `markdownInstitucional.ts`, `observabilidade.ts`,
  `fazerEntrevista.ts` contêm literais de estado herdados (a confirmar caso a
  caso na implementação se são contrato ou texto).

> Detecção nominal completa por arquivo/linha será gerada na fase de
> implementação do Q1-B (mesma metodologia do `docs/Q1-A1-INVENTARIO.md`).

---

## 3. Classificação consolidada

- **Falso positivo:** literais de "autor"/"tipo de mensagem" e textos de UI que
  coincidem com nomes de estado, mas não são contrato de status (verificar em
  implementação, como feito no Q1-A2 para `notificacoesService.ts`).
- **Aceitável por arquitetura:** 1.1, 1.6, 1.7, 1.9 (fonte canônica já existe ou
  não há constraint para divergir).
- **Precisa correção:** 1.2, 1.3, 1.5 (faltam espelhos tipados/allowlist).
- **Crítico:** 1.4 (entrevista sem `remarcada`) e 1.8 (drift de conjunto do
  vínculo de tratamento).

---

## 4. Proposta de allowlist (para a fase de implementação)

Constantes canônicas a centralizar/derivar do banco (sem schema change):

```text
ENTREVISTA_STATUS        +remarcada (alinhar ao CHECK)
AVISO_AUSENCIA_STATUS    aberto|em_tratamento|resolvido|descartado
NOTIF_STATUS             pendente|agendado|enviado|falha|cancelado
NOTIF_EVENTO             (16 labels do enum notif_evento)
NOTIF_CANAL              whatsapp
FILA_DIAGNOSTICO_MOTIVO  agendado_futuro|bloqueado_inelegivel:*|opt_out|
                         comunicacao_geral_desativada|sem_telefone|
                         aguardando_janela|aguardando_limite_diario|pendente
VINCULO_TRATAMENTO_STATUS (8 valores reais do CHECK) — após investigar VINCULO_STATUS
```

Itens **fora da allowlist por design** (governança no frontend, sem CHECK):
`voluntarios.status`, `voluntarios.termo_status`.

---

## 5. Proposta de testes futuros (Q1-B)

- **Puros (CI, `src/test/governanca`):** paridade entre constantes TS e a
  allowlist documentada; trava de regressão dos arquivos consolidados.
- **Integração real (`npm run test:db`, `src/test/integration/db`):**
  - paridade enum: `notif_status`, `notif_evento`, `notif_canal`,
    `status_etapa_plano`.
  - paridade CHECK: `entrevistas_fraternas.status`, `avisos_ausencia.status`,
    `assistido_tratamentos.status`.
  - paridade de conjunto de `fn_fila_motivo_inelegivel` / classes de
    `fn_fila_diagnostico_pendentes` (somente leitura — funções não alteradas).

---

## 6. Riscos de drift encontrados

- **Alto:** `VINCULO_STATUS` (1.8) representa um conjunto diferente do CHECK real
  — risco de decisões de UI inconsistentes; exige diagnóstico antes de corrigir.
- **Alto:** `ENTREVISTA_STATUS` (1.4) sem `remarcada` — estado válido do banco
  invisível ao frontend.
- **Médio:** ausência de espelho tipado para `notif_*` e diagnóstico de fila
  permite strings soltas em novos consumidores.
- **Baixo:** termos/status de voluntário sem CHECK — risco contido pela
  centralização já existente no frontend.

---

## 7. Confirmação de não-alteração (S1 / P1 / Q1-A2)

Nesta etapa (somente desenho), **nada** foi alterado:
- RLS — inalterada.
- grants/revokes — inalterados.
- `SECURITY DEFINER` — inalterado (`fn_fila_diagnostico_pendentes` e
  `fn_fila_motivo_inelegivel` apenas lidas).
- guardas de RPC já endurecidas — inalteradas.
- Métricas de segurança mantidas: **0028=0, 0025=0, 0029=56**.
- Runtime — sem mudança.

> Próximo passo só após aprovação: implementação do Q1-B conforme allowlist e
> testes acima, sem schema change e sem tocar segurança.
