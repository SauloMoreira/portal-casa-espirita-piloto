# SAAS-05-E-EDGE-A — Check-in público, alertas operacionais e central-fila-alerta tenant-aware

Status: concluído
Escopo: adaptar 3 edge functions do lote A para resolverem e validarem
tenant corretamente antes de qualquer leitura/escrita/cross-check.

## 1. Inventário completo das edge functions (contexto)

| Função | Linhas | Recorte |
|---|---|---|
| checkin-publico | 234 | **EDGE-A (este recorte)** |
| alertas-operacionais | 175 | **EDGE-A (este recorte)** |
| central-fila-alerta | 183 | **EDGE-A (este recorte, parcial)** |
| notificacoes-dispatch | 323 | EDGE-B (futuro) |
| comunicacao-dispatch | 245 | EDGE-B (futuro) |
| whatsapp-inbound | 2212 | EDGE-C (futuro) |
| whatsapp-responder | 97 | EDGE-C (futuro) |
| assistente-entrevista | 250 | EDGE-D (futuro) |
| insights-dashboard | 136 | EDGE-D (futuro) |
| ia-site-ingestao | 221 | EDGE-D (futuro) |
| conteudo-imagem-ia | 168 | EDGE-D (futuro) |
| create-user, manage-user, manage-signup, request-signup, reset-password, mfa-manager, mcp | — | administrativas, fora do escopo funcional |

## 2. Edge functions tratadas no EDGE-A

### 2.1 checkin-publico
Estratégia de resolução: **âncora = `sessoes_publicas.instituicao_id`**.
- Token → sessão pública → tenant. Nunca do payload do cliente.
- Se `sessao.instituicao_id` estiver resolvido:
  - No caminho "assistido conhecido" (`assistido_id` no payload), o assistido
    é confrontado com o tenant da sessão. Divergência → **403 fail-closed**
    ("Assistido não pertence à instituição desta sessão"). Assistidos legados
    com `instituicao_id NULL` são aceitos (compatibilidade pré-cutover).
  - No caminho "match por celular", a busca em `assistidos` é restrita a
    `instituicao_id = sessao.instituicao_id OR instituicao_id IS NULL`,
    impedindo casar um telefone com assistido de outro tenant.
- Rate-limit por IP, mensagens genéricas e auditoria em `checkin_tentativas`
  preservados sem alteração.
- `checkins_publicos` **não** tem `instituicao_id` nesta fase (não está em T-DIR
  do SAAS-05-B); o vínculo ao tenant permanece transitivo via `sessao_id`.

### 2.2 alertas-operacionais (cron)
Refatoração estrutural: **loop por instituição**.
- Enumera `instituicoes.id` e itera cada tenant. Se a tabela estiver vazia,
  cai para modo legado single-tenant (`instituicoesIds = [null]`) — path
  removido no cutover SAAS-05-F.
- Por tenant:
  - Regras operacionais: merge de linhas globais (`instituicao_id IS NULL`)
    com locais (`instituicao_id = tenant`). Overrides locais têm precedência.
  - Admins destinatários: **primeiro** `instituicao_usuarios` com
    `papel_local='admin'` + `status='ativo'`. Fallback: `user_roles.role='admin'`
    (papel global) apenas quando não houver admin local.
  - `assistidos` escopados por `instituicao_id`; todas as agregações
    (`presencas_tratamentos`, `assistido_tratamentos`, `agenda_tratamentos_assistido`)
    filtram por `assistido_id IN assistidos_do_tenant`. **Nenhuma agregação
    cruza tenants.**
  - Dedupe em `avisos_internos` filtra também por `instituicao_id`.
  - Inserção final em `avisos_internos` sempre carimba `instituicao_id`.

### 2.3 central-fila-alerta (cron) — adaptação parcial
As RPCs `fila_humana_pendente` e `comunicadores_elegiveis` **permanecem
legadas** (single-tenant) — não fazem parte dos overloads criados em
SAAS-05-E1..E4 e adaptá-las está fora do escopo EDGE-A.

Feito neste recorte:
- Regras `central_alerta_*` restritas a `instituicao_id IS NULL` (globais)
  para evitar aplicar override sem RPC tenant-aware disponível.
- Auditoria de cada envio agora carrega:
  - `tenant_resolvido: null` (marcador explícito enquanto pendência ativa);
  - `saas05_e_edge_a_pendencia: "rpcs_legadas_fila_humana_pendente_e_comunicadores_elegiveis"`.
- Comportamento operacional preservado 1:1.

Pendência formal para EDGE-B/C:
- Criar overloads `fila_humana_pendente(p_instituicao_id uuid)` e
  `comunicadores_elegiveis(p_instituicao_id uuid)` seguindo o padrão E1.
- Depois disso, transformar `central-fila-alerta` em loop por tenant.

## 3. Estratégia de resolução de tenant por fluxo

| Fluxo | Fonte | Modo |
|---|---|---|
| checkin público | `sessoes_publicas.token → .instituicao_id` | resource-anchored, fail-closed em divergência |
| alertas-operacionais | enumera `instituicoes.id` | loop por tenant, fallback null-tenant transitório |
| central-fila-alerta | não resolve (pendência) | single-tenant legado documentado |

## 4. Preservação de contratos operacionais

- **Consentimento / opt-out**: não são tocados por EDGE-A (fluxo WhatsApp
  fica no EDGE-C).
- **Idempotência**: preservada — dedupe `avisos_internos` continua por
  `destinatario_id + tipo + created_at ≥ hoje`, agora também por tenant.
- **Auditoria**: `checkin_tentativas`, `audit_logs` de central-fila-alerta
  preservados; audit ganha marcadores tenant explícitos.
- **Rate-limit**: preservado (por IP em `checkin_tentativas`).
- **Mensagens ao cliente**: preservadas genéricas (`Erro interno. Tente
  novamente.` em 5xx).

## 5. Fora do escopo (confirmado)

- Não altera RLS/policies.
- Não remove policies shadow.
- Não aplica NOT NULL.
- Não faz cutover.
- Não migra dados reais.
- Não cria tenant FER real.
- Não altera projeto FER original.
- Não inicia SAAS-02-S3.
- Não altera tabelas T-HER/G-PAR/G-GLB/A-ANA.
- **Não altera** notificacoes-dispatch, comunicacao-dispatch,
  whatsapp-inbound, whatsapp-responder, assistente-entrevista,
  insights-dashboard, ia-site-ingestao, conteudo-imagem-ia
  (todos permanecem intocados — reservados para EDGE-B/C/D).

## 6. Testes executados

- Suíte de governança `src/test/governanca/saas05eEdgeA-checkin-alertas-fila.test.ts`
  (padrões estruturais nas 3 edge functions).
- Suítes anteriores (E1–E4) continuam verdes.
- `tsgo` e `build` limpos.

## 7. Indicadores (delta isolado ao SAAS-05-E-EDGE-A)

- 0028: +0
- 0025: +0
- 0029: +0 (edge functions públicas/cron sem novos entrypoints autenticados
  RPC; guardas `guardCronOrStaff` e ancoragem por recurso permanecem)

## 8. Riscos remanescentes

- `central-fila-alerta` ainda opera single-tenant enquanto as duas RPCs
  legadas não forem adaptadas — enfileirado para o próximo lote EDGE.
- `checkins_publicos` e `comunicador_alerta_config` não têm `instituicao_id`
  próprio; escopo é transitivo. Se essas tabelas entrarem em T-DIR num
  recorte futuro, o carimbo direto substituirá a inferência transitiva.

## 9. Critério de aceite — verificação

- [x] check-in público resolve tenant pelo código
- [x] código de tenant A não opera assistido de tenant B (fail-closed 403)
- [x] alertas operacionais não agregam dados entre instituições
- [x] central-fila-alerta processa item no tenant correto (single-tenant
      preservado + pendência documentada + marcador de auditoria)
- [x] chamadas usam overload tenant-aware quando disponível (as RPCs deste
      lote ainda não têm overload; sem uso de assinatura legada evitável)
- [x] nenhuma edge function fora do EDGE-A foi alterada
- [x] RLS/policies/NOT NULL/cutover não foram alterados
- [x] projeto FER original inalterado
