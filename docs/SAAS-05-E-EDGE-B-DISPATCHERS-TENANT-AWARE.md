# SAAS-05-E-EDGE-B — Dispatchers tenant-aware

## Escopo
- `supabase/functions/notificacoes-dispatch/index.ts`
- `supabase/functions/comunicacao-dispatch/index.ts`

Não alterados: `whatsapp-inbound`, `whatsapp-responder`, `assistente-entrevista`,
`insights-dashboard`, `ia-site-ingestao`, `conteudo-imagem-ia`,
`checkin-publico`, `alertas-operacionais`, `central-fila-alerta`.

## Inventário

### notificacoes-dispatch
- **Tabelas lidas:** `notificacoes_fila`, `notificacoes_preferencias`,
  `notificacoes_templates`, `assistidos`.
- **Tabelas escritas:** `notificacoes_fila`, `notificacoes_log`.
- **RPCs:** `fn_fila_motivo_inelegivel(p_fila_id)` (fonte única de elegibilidade).
- **Provider externo:** adapter WhatsApp (`_shared/channel-adapter`).
- **Regras preservadas:** opt-out (`whatsapp_ativo`), consentimento geral
  (`comunicacao_geral_ativa`), janela horária, limite diário, retry_count,
  sent_at, external_message_id, dedupe_key, idempotência.

### comunicacao-dispatch
- **Tabelas lidas:** `comunicacoes_institucionais`,
  `comunicacoes_institucionais_envios`, `notificacoes_preferencias`,
  `assistidos`.
- **Tabelas escritas:** `comunicacoes_institucionais`,
  `comunicacoes_institucionais_envios`, `audit_logs`.
- **Regras preservadas:** consentimento (opt-out canal, revogação, geral),
  janela horária, escalonamento anti-spam, retry, contadores por comunicação.

## Estratégia de resolução de tenant

### notificacoes-dispatch
Ancorada em `assistidos.instituicao_id` (pré-cutover a fila ainda não carrega
`instituicao_id`). Nova helper `resolverTenantDoItem` retorna
`{ tenantId, origem }`. O contexto é injetado no `notificacoes_log` via
`payload_enviado.tenant_resolvido / origem_tenant / marcador` (sem alteração
de schema). Itens sem assistido ou com assistido pré-cutover seguem o fluxo
tradicional marcados como `assistido_sem_tenant`.

### comunicacao-dispatch
Ancorada em `comunicacoes_institucionais.instituicao_id` — quando presente,
o dispatcher verifica o `instituicao_id` do assistido destinatário e bloqueia
o envio com `motivo = tenant_mismatch` mais `audit_logs.acao =
SAAS05_E_EDGE_B_TENANT_MISMATCH` sempre que houver divergência
(fail-closed). Envios de comunicação pré-cutover (sem tenant) permanecem no
fluxo legado.

## Consentimento e opt-out
- `notificacoes-dispatch`: opt-out de canal cancela item; `geral` desativado
  cancela item; janela horária adia; limite diário adia. Nenhuma dessas
  regras foi flexibilizada pelo recorte.
- `comunicacao-dispatch`: opt-out explícito ou `consentimento_status =
  revogado` bloqueia com `consentimento_revogado`; `comunicacao_geral_ativa`
  desativada bloqueia com `comunicacao_geral_desativada`; ausência de
  telefone bloqueia com `sem_telefone`.

## Logs e auditoria
- `notificacoes_log.payload_enviado` passa a conter `tenant_resolvido`,
  `origem_tenant` e `marcador: "saas05_e_edge_b"`.
- `audit_logs` de conclusão de comunicação registra `tenant_resolvido`
  (`com.instituicao_id`) e `marcador: "saas05_e_edge_b"`.
- Ambiguidade cross-tenant em comunicação institucional gera evento
  auditável dedicado (`SAAS05_E_EDGE_B_TENANT_MISMATCH`).

## Testes executados
- Nova suíte: `src/test/governanca/saas05eEdgeB-dispatchers-tenant-aware.test.ts`.
- Cobre: resolução de tenant, tenant_mismatch fail-closed, preservação de
  consentimento/opt-out, preservação de retry/idempotência, escopo isolado.

## Pendências para EDGE-C / EDGE-D
- **EDGE-C:** `whatsapp-inbound`, `whatsapp-responder` — resolução de tenant
  por conversa/handoff, propagação para respostas automatizadas.
- **EDGE-D:** IA ampla (`assistente-entrevista`, `insights-dashboard`,
  `ia-site-ingestao`, `conteudo-imagem-ia`) — escopo de contexto por tenant
  em prompts e ingestão.

## Indicadores (delta EDGE-B)
- `0028`: +0
- `0025`: +0
- `0029`: +0 (nenhum novo entrypoint autenticado; ajuste isolado em edge
  functions internas).

## Fora do escopo (confirmado)
- Sem alteração em RLS/policies, NOT NULL, cutover, tabelas T-DIR/T-HER.
- Sem alteração em `whatsapp-inbound`, `whatsapp-responder`, IA ampla,
  `checkin-publico`, `alertas-operacionais`, `central-fila-alerta`.
- Projeto FER original intocado.
