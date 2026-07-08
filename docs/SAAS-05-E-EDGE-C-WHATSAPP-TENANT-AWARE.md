# SAAS-05-E-EDGE-C — WhatsApp inbound/responder tenant-aware

## Escopo
- `supabase/functions/whatsapp-inbound/index.ts`
- `supabase/functions/whatsapp-responder/index.ts`

Não alterados: `assistente-entrevista`, `insights-dashboard`,
`ia-site-ingestao`, `conteudo-imagem-ia`, `checkin-publico`,
`alertas-operacionais`, `central-fila-alerta`, `notificacoes-dispatch`,
`comunicacao-dispatch`.

## Inventário

### whatsapp-inbound
- **Tabelas lidas:** `assistidos`, `profiles`, `whatsapp_conversas`,
  `whatsapp_handoffs`, `notificacoes_preferencias`, `notificacoes_log`,
  `regras_operacionais`, `ia_site_documentos`, `agenda_tratamentos_assistido`,
  `sessoes_publicas`, `programacao_padrao`, `eventos`, `campanhas`,
  `acao_social_alimentos`, `excecoes_operacionais`, `entrevistas_fraternas`,
  `tipos_tratamento`, `app_cron_secrets`.
- **Tabelas escritas:** `whatsapp_conversas`, `whatsapp_handoffs`,
  `notificacoes_preferencias`, `consentimentos_comunicacao`,
  `notificacoes_log`, `audit_logs`.
- **RPCs:** nenhuma nova (mantém consultas diretas). Chamadas para o LLM
  externo continuam controladas por chave institucional.
- **Regras preservadas:** autenticação por segredo do webhook, opt-out/opt-in,
  handoff humano (`whatsapp_handoffs`), retry conservador do LLM,
  idempotência de conversa (uma por telefone).

### whatsapp-responder
- **Tabelas lidas:** `user_roles`, `whatsapp_conversas`, `assistidos`,
  `instituicao_usuarios`.
- **Tabelas escritas:** `whatsapp_conversas`, `notificacoes_log`, `audit_logs`.
- **RPCs:** `is_platform_admin(_user_id)` para bypass do gate por tenant.
- **Regras preservadas:** autenticação por JWT do atendente,
  papel `admin`/`coordenador_de_tratamento`, autor `humano`, adapter externo,
  atualização de `ultimo_contato_em`.

## Estratégia de resolução de tenant

### whatsapp-inbound
1. Busca de assistidos por telefone agora inclui `instituicao_id`.
2. Se **um único** candidato → `tenant_resolvido = assistido.instituicao_id`,
   `origem_tenant = "assistido"` (ou `"assistido_sem_tenant"` pré-cutover).
3. Se **múltiplos** candidatos em **tenants distintos** → fail-closed:
   `assistido = null`, `origem_tenant = "ambiguo_multi_tenant"`,
   registra `audit_logs.acao = SAAS05_E_EDGE_C_TELEFONE_AMBIGUO` com
   `telefone`, `candidatos_ids`, `tenants` e marcador `saas05_e_edge_c`.
4. Se múltiplos candidatos, mas mesmo tenant (ou todos pré-cutover) →
   mantém o comportamento pré-EDGE-C (primeiro match), com tenant resolvido.
5. Toda mensagem recebida gera `audit_logs.acao = SAAS05_E_EDGE_C_INBOUND`
   com `tenant_resolvido`, `origem_tenant` e `marcador` — sem alterar o
   schema de `whatsapp_conversas`.

### whatsapp-responder
1. Carrega a conversa incluindo `assistido_id`.
2. Se a conversa tem assistido vinculado, resolve `tenant_resolvido` via
   `assistidos.instituicao_id`.
3. Se `tenant_resolvido` estiver definido, exige que o atendente pertença
   à mesma instituição (via `instituicao_usuarios`) OU seja
   `platform_admin`. Caso contrário retorna `403` e registra
   `audit_logs.acao = SAAS05_E_EDGE_C_RESPONDER_TENANT_MISMATCH`.
4. Conversas sem tenant resolvível (pré-cutover) seguem o fluxo antigo.

## Regra para telefone ambíguo
- **Fail-closed absoluto**: nunca escolhe tenant arbitrário quando o mesmo
  telefone existe em mais de uma instituição.
- Conversa é criada/atualizada **sem `assistido_id`** nesse caso.
- Nenhuma preferência de comunicação, opt-out ou consentimento é gravada
  em nome de assistido de outro tenant.
- Auditoria explícita permite que uma casa espírita faça triagem manual do
  caso.

## Consentimento e opt-out
- `notificacoes_preferencias` e `consentimentos_comunicacao` continuam
  escopados por `assistido_id`. Como só se grava opt-out/opt-in quando há
  assistido não-ambíguo identificado, opt-out do tenant A **não** afeta
  envios do tenant B.
- O modelo atual não separa consentimento por tenant além do vínculo do
  assistido — documentado como pendência para SAAS-05-F/cutover.

## Handoff humano
- `whatsapp_handoffs` continua sendo o ledger canônico.
- Handoff é aberto/consultado a partir do `conversa_id`; como a conversa
  já é escopada por tenant (via assistido), o handoff herda o escopo.
- A fila humana (usada pela Central) já opera sobre o overload tenant-aware
  criado no EDGE-A2 (`fila_humana_pendente(p_instituicao_id)`).

## RPCs chamadas
- `is_platform_admin(_user_id)` no responder para bypass de gate por tenant.
- Nenhuma outra RPC nova é adicionada. Consultas diretas mantêm a
  compatibilidade pré-cutover.

## Logs e auditoria
- `audit_logs.SAAS05_E_EDGE_C_INBOUND` — tenant/origem/marcador por mensagem.
- `audit_logs.SAAS05_E_EDGE_C_TELEFONE_AMBIGUO` — telefone em >1 tenant.
- `audit_logs.SAAS05_E_EDGE_C_RESPONDER_TENANT_MISMATCH` — atendente fora
  do tenant da conversa.
- `notificacoes_log.payload_enviado` no responder passa a carregar
  `tenant_resolvido`, `origem_tenant`, `marcador`.

## Testes executados
- Nova suíte: `src/test/governanca/saas05eEdgeC-whatsapp-tenant-aware.test.ts`
  (18 casos).
- Cobre: resolução de tenant, fail-closed em ambiguidade, tenant_mismatch
  no responder, preservação de opt-out/consentimento/handoff, escopo isolado.

## Pendências para EDGE-D
- `assistente-entrevista`: escopo de contexto por tenant em prompts e RPCs
  operacionais.
- `insights-dashboard`: métricas agregadas por instituição.
- `ia-site-ingestao`: base de conhecimento por instituição.
- `conteudo-imagem-ia`: geração de imagem institucional por tenant.

## Indicadores (delta EDGE-C)
- `0028`: +0
- `0025`: +0
- `0029`: +0 (edge-only, sem novos entrypoints RPC autenticados; a chamada
  a `is_platform_admin` já existia).

## Fora do escopo (confirmado)
- Sem alteração em RLS/policies, NOT NULL, cutover, tabelas T-DIR/T-HER.
- Sem alteração em IA ampla (`assistente-entrevista`, `insights-dashboard`,
  `ia-site-ingestao`, `conteudo-imagem-ia`).
- Sem alteração em `checkin-publico`, `alertas-operacionais`,
  `central-fila-alerta`, `notificacoes-dispatch`, `comunicacao-dispatch`.
- Projeto FER original intocado.
