# SAAS-05-I — Telemetria de uso legado e preparação para revogação faseada

Status: concluído.
Escopo: instrumentação aditiva de telemetria. Nenhuma RPC revogada, nenhum
fallback removido, nenhuma policy/NOT NULL alterada, nenhum dado real migrado,
projeto FER original intocado.

## 1. Instrumentação criada

### 1.1 Tabelas
- `public.saas05_i_legacy_rpc_events` — 1 linha por chamada de assinatura
  legada. Campos: `rpc_nome`, `origem`, `tenant_recebido`,
  `overload_tenant_aware_existe`, `contexto (jsonb)`,
  `marcador = 'saas05_i_legacy_rpc_usage'`, `created_at`.
- `public.saas05_i_fallback_events` — 1 linha por ativação de fallback.
  Campos: `fallback_nome`, `motivo`, `tenant_resolvido`, `origem_tenant`,
  `fail_closed`, `contexto (jsonb)`,
  `marcador = 'saas05_i_fallback_usage'`, `created_at`.

Ambas com RLS: leitura restrita a `admin` via `has_role`; escrita apenas via
helpers `SECURITY DEFINER`. `service_role` com acesso total (edges).

### 1.2 Helpers SECURITY DEFINER
- `fn_saas05_i_log_legacy_rpc(p_rpc, p_origem, p_tenant_recebido, p_overload_tenant_aware_existe, p_contexto)`
- `fn_saas05_i_log_fallback(p_fallback, p_motivo, p_tenant_resolvido, p_origem_tenant, p_fail_closed, p_contexto)`

Ambos com bloco `EXCEPTION WHEN OTHERS THEN NULL` — telemetria nunca quebra
o chamador. `EXECUTE` revogado de `PUBLIC`; concedido a
`authenticated, service_role`.

## 2. Pontos instrumentados

### 2.1 RPCs legadas (instrumentação por consumidor conhecido)
- `central-fila-alerta` → `fila_humana_pendente` (assinatura sem parâmetro,
  caminho `service_role` no fallback `tenantsIds=[null]`).
- `central-fila-alerta` → `comunicadores_elegiveis` (idem).

Consumidores adicionais (Lote C) permanecem sem instrumentação neste recorte
porque exigiria alterar a assinatura ou o corpo das RPCs (risco fora do
escopo). Ficam previstas para SAAS-05-I2 via triggers/wrappers.

### 2.2 Fallbacks residuais
- `central-fila-alerta` → `tenants_ids_vazio` (quando não há instituições
  cadastradas e o scheduler cai para `[null]`).
- `alertas-operacionais` → `tenants_ids_vazio` (mesmo padrão).
- `whatsapp-inbound` → `tenant_ambiguo` (`origemTenant = "ambiguo_multi_tenant"`),
  registrando `candidatos_count` e `tenants_distintos` em `contexto`.

## 3. Preparação para scheduler com `tenantsIds` não-vazio

Pontos identificados que ainda aceitam `tenantsIds` vazio como caminho normal:
- `central-fila-alerta` (linha ~96) — cai para `[null]` quando não há
  `instituicoes`.
- `alertas-operacionais` (linha ~42) — mesmo padrão.

Bloqueadores para tornar obrigatório:
- ambientes recém-provisionados podem legitimamente ter 0 tenants;
- reprocessamentos manuais podem invocar as edges sem lista;
- exige revisão do orquestrador de cron para pular execução em vez de cair
  em legado.

Plano: **não tornar obrigatório neste recorte**. Após ~1 ciclo operacional
sem eventos `tenants_ids_vazio` nas tabelas de telemetria, considerar
migração no SAAS-05-I2/J transformando o caminho legado em `return early`
com log estruturado.

## 4. Critérios objetivos para revogação futura

### Revogação de `authenticated` (Lote B)
Requer, cumulativamente por assinatura legada:
- 0 eventos `saas05_i_legacy_rpc_events` com `origem` ≠ `service_role`
  por 14 dias consecutivos;
- confirmação de que nenhum novo consumidor frontend foi adicionado no
  período (revisão manual do diff);
- teste E2E verde no ciclo de referência.

### Remoção de fallback
Requer, por fallback:
- 0 eventos `saas05_i_fallback_events` do fallback por 30 dias consecutivos;
- scheduler ajustado para nunca acionar caminho sem tenant;
- teste de contrato garantindo `return early` em vez de fallback.

### Drop físico da assinatura legada
Requer, além dos itens acima:
- 0 eventos `saas05_i_legacy_rpc_events` (qualquer origem) por 30 dias;
- rollback plan documentado.

## 5. Testes

- Suíte `saas05i-telemetria-uso-legado.test.ts` cobre:
  - existência da migração marcada `SAAS-05-I`;
  - criação das duas tabelas com RLS e helpers;
  - `EXCEPTION WHEN OTHERS THEN NULL` presente nos helpers;
  - `EXECUTE` revogado de `PUBLIC`, concedido a `authenticated, service_role`;
  - `central-fila-alerta` chama `fn_saas05_i_log_fallback` no caminho
    `tenants_ids_vazio` e `fn_saas05_i_log_legacy_rpc` para as duas RPCs
    legadas;
  - `alertas-operacionais` chama `fn_saas05_i_log_fallback` no caminho
    `tenants_ids_vazio`;
  - `whatsapp-inbound` chama `fn_saas05_i_log_fallback` no ponto
    `tenant_ambiguo`;
  - nenhuma RPC foi revogada nesta migração;
  - nenhuma edge remove fallback;
  - contratos F3 preservados (NOT NULL, shadow policies).

## 6. Escopo preservado

- Nenhuma RPC revogada.
- Nenhum fallback removido.
- Nenhuma policy alterada.
- Nenhum NOT NULL alterado.
- Nenhum dado real migrado.
- Nenhum tenant FER real criado.
- Projeto FER original intocado.
- Retorno funcional das edges preservado (telemetria é `await` de RPC que
  nunca lança).

## 7. Indicadores

- 0028: sem regressão (helpers com EXECUTE restrito).
- 0025: sem regressão.
- 0029: +2 warnings esperados (dois novos helpers `SECURITY DEFINER`
  `fn_saas05_i_log_legacy_rpc` e `fn_saas05_i_log_fallback`), ambos
  justificados: bypass de RLS necessário para gravação universal de
  telemetria, com EXECUTE controlado.

Delta atribuível ao SAAS-05-I: **0028 +0, 0025 +0, 0029 +2 justificados**.

## 8. Pendências para SAAS-05-I2/J

- Instrumentar RPCs de Lote C no corpo da função (requer overload wrapper
  ou trigger de auditoria específico).
- Ajustar scheduler de `central-fila-alerta` e `alertas-operacionais` para
  pular execução quando não há tenants.
- Painel admin de leitura das tabelas de telemetria (fora deste recorte).
- Após ciclo de observação, aplicar §4 e revogar Lote B.

## 9. Recomendação

Autorizar **SAAS-05-I2** após 1 ciclo operacional com telemetria capturando
dados, focado em (a) wrapper de auditoria para Lote C e (b) ajuste dos
schedulers para eliminar `tenants_ids_vazio`.
