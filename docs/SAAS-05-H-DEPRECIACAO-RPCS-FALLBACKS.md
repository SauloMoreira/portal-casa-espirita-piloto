# SAAS-05-H — Depreciação faseada de RPCs legadas e hardening dos fallbacks residuais

Status: concluído.
Escopo: inventário confirmado + classificação por lote + hardening documental dos
3 fallbacks residuais. Sem migração destrutiva, sem revogação cega, sem
alteração de dados reais, sem alteração do projeto FER original.

## 1. Inventário confirmado de RPCs legadas com overload tenant-aware

Todas as RPCs abaixo possuem overload tenant-aware criado nos recortes
E1/E2/E3/E4/EDGE-A2. A assinatura legada (sem `p_instituicao_id`) permanece
fisicamente no banco por compatibilidade de rollback.

| RPC (nome) | Overload tenant-aware | Recorte | Consumidor legado atual |
| ---------- | --------------------- | ------- | ----------------------- |
| gerenciar_voluntario | sim | E1 | services/frontend (Voluntários) |
| gerenciar_termo_voluntario | sim | E1 | services/frontend (Voluntários) |
| fn_buscar_pessoa_para_voluntario | sim | E1 | services/frontend (Voluntários) |
| fn_processar_excecao_notificacoes | sim | E1 | services/programacao/excecoesService |
| fn_monitor_excecao_notificacoes | sim | E1 | services/programacao + cron |
| pts_registrar_presenca | sim | E2 | services/agendaPlano + edges |
| pts_registrar_ausencia | sim | E2 | services/agendaPlano + edges |
| pts_rollback_piloto | sim | E2 | services/agendaPlano (tenant-aware) |
| pts_homologacao_auditar | sim | E2 | services/agendaPlano (tenant-aware) |
| agendar_entrevista_fraterna | sim | E3 | services/frontend (Entrevistas) |
| fn_entrevistas_operacional | sim | E3 | pages/Entrevistas + CartaAgendamento (tenant-aware) |
| fn_registrar_aviso_ausencia | sim | E3 | services/avisos |
| fn_tratar_aviso_ausencia | sim | E3 | services/avisos |
| dashboard_admin | sim | E4 | frontend Dashboard |
| relatorio_tratamentos_concluidos | sim | E4 | services/relatorios |
| relatorio_carga_tarefeiro | sim | E4 | services/relatorios |
| relatorio_frequencia_presenca | sim | E4 | services/relatorios |
| relatorio_faltas_periodo | sim | E4 | services/relatorios |
| metricas_ia_whatsapp | sim | E4 | central-ia/MetricasWhatsApp (tenant-aware) |
| fila_humana_pendente | sim | EDGE-A2 | edge central-fila-alerta (fallback) |
| comunicadores_elegiveis | sim | EDGE-A2 | edge central-fila-alerta (fallback) |

## 2. Classificação por lote

### Lote A — sem consumidor legado, com overload tenant-aware equivalente

**Conjunto vazio.** Todas as RPCs listadas ainda possuem pelo menos um
consumidor da assinatura legada (frontend, service ou edge com fallback).
Revogação cega em Lote A seria regressão funcional.

Ação executada: **nenhuma revogação**. Registro formal de que o lote está
vazio nesta iteração.

### Lote B — usado apenas por cron/service_role e seguro temporariamente

- `fila_humana_pendente` (legado, sem parâmetro) — consumo residual **apenas
  pela edge `central-fila-alerta` via `service_role`** no caminho de fallback
  (`tenantId === null`). Autenticado não deveria executá-la; hoje esse caminho
  só é acionado por scheduler global sem tenant identificado.
- `comunicadores_elegiveis` (legado) — mesma situação: fallback da edge
  `central-fila-alerta` sob `service_role`.
- `fn_monitor_excecao_notificacoes` (assinatura sem tenant) — consumida por
  `pg_cron` e pelo caminho interno (`auth.uid()` NULL), conforme cobertura em
  `lote-c-residual-0029.dbtest.ts`.

Ação: **manter apenas para service_role/cron**. Não introduzida revogação
destrutiva neste recorte porque:
- as três já negam autenticado sem papel (contrato coberto em testes anteriores);
- revogar EXECUTE de `authenticated` exigiria migração destrutiva com risco
  de regressão em outras rotas administrativas;
- o plano formal de revogação `authenticated` fica registrado abaixo (§5).

### Lote C — ainda consumido funcionalmente pelo frontend/services

Todas as demais RPCs da tabela §1. Ação: **preservar assinatura legada** até
que 100% dos consumidores migrem para o overload tenant-aware. Plano de
migração por consumidor está no §5.

## 3. Ações executadas por RPC

Nenhuma revogação destrutiva foi aplicada. Motivo:
- todos os overloads legados ainda têm consumidor funcional ou dependem do
  caminho `service_role`/cron;
- os recortes E1–E4 e EDGE-A2 já forçam o overload tenant-aware quando o
  consumidor passa `p_instituicao_id`, e o overload novo é `SECURITY DEFINER`
  com validação de tenant (fail-closed);
- risco/benefício de revogar em H é inferior ao risco de regressão sem
  observabilidade adicional.

## 4. Hardening dos fallbacks residuais

### 4.1 central-fila-alerta

Fallback: quando `tenantId === null`, chama `fila_humana_pendente()` e
`comunicadores_elegiveis()` sem parâmetro.

Estado atual (confirmado):
- executado exclusivamente por `service_role` (edge scheduler);
- não aceita `instituicao_id NULL` como caminho normal — só é acionado quando
  o scheduler foi disparado sem lista de tenants;
- não permite cross-tenant: o fallback lê estado global e cai no caminho
  legacy explicitamente marcado (`${tenantId ?? "legacy"}` nos logs);
- auditoria: os erros já registram o marcador `legacy` (linhas 121 e 142 da
  edge).

Decisão: **manter fallback**, formalmente aceito. Remoção fica para o
próximo recorte, condicionada à migração do scheduler para envio explícito de
`tenantsIds` sempre não-vazio.

### 4.2 whatsapp-inbound

Fallback: tenant por número institucional (mapeado em `whatsapp_numeros`).

Estado atual (confirmado nos recortes EDGE-C):
- fail-closed: sem match → resposta neutra e log de tenant ambíguo;
- não permite cross-tenant: número é chave forte;
- não aceita mensagem sem tenant resolvido em fluxo pessoal.

Decisão: **manter, formalmente aceito**. É a via primária de resolução de
tenant em canal público. Remoção não se aplica.

### 4.3 alertas-operacionais

Fallback: tenant por origem do alerta (item da fila).

Estado atual:
- fail-closed: alerta sem origem tenant → descartado com log;
- não permite cross-tenant: origem herdada do próprio item.

Decisão: **manter, formalmente aceito**.

## 5. Plano de migração/depreciação (SAAS-05-I ou posterior)

1. Instrumentar telemetria em cada assinatura legada por 1 ciclo operacional.
2. Migrar consumidores frontend restantes para passarem `p_instituicao_id`
   em todos os `supabase.rpc(...)` (hoje apenas 4 pontos passam explicitamente).
3. Após 0 hits em 2 semanas: revogar `EXECUTE` de `authenticated` da
   assinatura legada.
4. Após 0 hits em 1 mês: revogar `service_role` das assinaturas legadas do
   Lote B, migrando o scheduler para `tenantsIds` não-vazio.
5. Só então: `DROP FUNCTION` das assinaturas legadas.

## 6. Escopo preservado

- Nenhum dado real migrado.
- Nenhum tenant FER real criado.
- Nenhuma cópia do projeto FER original.
- Projeto FER original intocado.
- Nenhuma regra de negócio alterada.
- Nenhum refactor amplo de frontend.
- Nenhum template alterado.
- Nenhuma integração externa alterada.
- RLS, policies e NOT NULL do F3 permanecem intactos.

## 7. Indicadores

- 0028: sem regressão em relação ao SAAS-05-G.
- 0025: sem regressão.
- 0029: sem regressão; findings S4 continuam resolvidos.

Delta atribuível ao SAAS-05-H: **0028 +0, 0025 +0, 0029 +0**.

## 8. Riscos remanescentes

- Assinaturas legadas continuam expostas a `authenticated` até que a
  telemetria/migração do §5 seja concluída.
- Fallback do `central-fila-alerta` só pode ser removido após o scheduler
  parar de acionar caminho sem tenant.
- Sem telemetria dedicada, não há certeza empírica de que Lote A é vazio
  em produção; a classificação atual é conservadora (assume "há consumidor").

## 9. Recomendação para o próximo recorte

Autorizar **SAAS-05-I** com:
- instrumentação de telemetria por assinatura legada;
- migração dos consumidores frontend restantes;
- após ciclo observado, revogação de `EXECUTE authenticated` das legadas
  cuja telemetria confirme Lote A;
- remoção do fallback `service_role` do `central-fila-alerta` com scheduler
  já ajustado.
