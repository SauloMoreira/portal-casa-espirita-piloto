# SAAS-05-E-EDGE-A2 — RPCs tenant-aware de fila humana e comunicadores elegíveis

Status: concluído
Pré-requisito para EDGE-B; fecha a pendência declarada em EDGE-A na
`central-fila-alerta`.

## 1. RPCs inventariadas

| RPC | Assinatura legada | Tabelas lidas |
|---|---|---|
| `fila_humana_pendente` | `() → (total_pendentes int, idade_mais_antiga_min int)` | `whatsapp_handoffs` |
| `comunicadores_elegiveis` | `() → (user_id uuid, celular text)` | `voluntarios`, `voluntario_funcoes`, `funcoes_voluntariado`, `profiles`, `comunicador_alerta_config` |

Chamadas atuais: apenas `supabase/functions/central-fila-alerta/index.ts`.
(EDGE-B — notificacoes-dispatch/comunicacao-dispatch — **não** as chama.)

## 2. Overloads criados

### `fila_humana_pendente(p_instituicao_id uuid)`
- **Padrão E1**:
  - `p_instituicao_id NOT NULL` → `RAISE 22023`.
  - Se `auth.uid() IS NOT NULL`: exige `is_platform_admin(uid) OR is_member_of_instituicao(uid, p_instituicao_id)` → `42501`.
  - Contexto service_role (edge/cron) tem `auth.uid() = NULL` e é permitido (o edge já é gated por `guardCronOrStaff`).
  - `set_config('app.current_instituicao', p_instituicao_id::text, true)` após validação.
- **Filtro de tenant** (resolução transitiva — `whatsapp_handoffs` não tem `instituicao_id`):
  ```
  handoff → whatsapp_conversas → assistidos.instituicao_id = p_instituicao_id
  ```
- **Fail-closed**: handoffs sem `assistido_id` (`conversa.assistido_id IS NULL`) são
  **excluídos**, pois não podem ser atribuídos com segurança a um tenant.
  Esses handoffs continuam visíveis apenas via assinatura legada.
- `SECURITY DEFINER`, `search_path = public`, `STABLE`.
- `REVOKE ALL FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated, service_role`.

### `comunicadores_elegiveis(p_instituicao_id uuid)`
- Mesmo padrão de validação de E1.
- **Filtro de tenant**: `voluntarios.instituicao_id = p_instituicao_id` no CTE
  `comunicadores`. `profiles` e `comunicador_alerta_config` seguem globais
  (não estão em T-DIR nesta fase).
- Ambiguidade de telefone continua tratada pelo padrão de `tel_unico_vol` /
  `tel_unico_perfil` (a fila só considera telefone com match único).

## 3. Contrato antes/depois

| Antes | Depois |
|---|---|
| `rpc('fila_humana_pendente')` — global | `rpc('fila_humana_pendente', { p_instituicao_id })` — só handoffs do tenant |
| `rpc('comunicadores_elegiveis')` — global | `rpc('comunicadores_elegiveis', { p_instituicao_id })` — só voluntários do tenant |
| Assinatura legada usada pela central-fila-alerta | Legada preservada para backward-compat, chamada apenas no fallback single-tenant |

## 4. Adaptação da central-fila-alerta

- Enumera `instituicoes.id` e itera em loop por tenant.
- Cada tenant → chama `fila_humana_pendente(p_instituicao_id)` e
  `comunicadores_elegiveis(p_instituicao_id)`, avalia gatilho e envia
  isoladamente.
- Auditoria (`audit_logs`) passa a registrar:
  - `tenant_resolvido: <uuid>`,
  - `saas05_e_edge_a2: "tenant_aware"` (ou `"fallback_legacy"` quando sem
    instituições cadastradas).
- Marcador `saas05_e_edge_a_pendencia` removido (pendência fechada).
- Fallback single-tenant preservado (`tenantsIds = [null]`) somente até o
  cutover SAAS-05-F — chama assinatura legada quando `tenantId === null`.
- Idempotência (`ultimo_alerta_em`, `ultimo_snapshot`) e cooldown por
  comunicador **preservados 1:1**.
- Regras `central_alerta_*` continuam restritas a globais nesta fase.

## 5. Fora do escopo (verificado)

- Não altera notificacoes-dispatch, comunicacao-dispatch, whatsapp-inbound,
  whatsapp-responder, assistente-entrevista, insights-dashboard,
  ia-site-ingestao, conteudo-imagem-ia, checkin-publico, alertas-operacionais.
- Não altera RLS/policies/NOT NULL/cutover.
- Não migra dados reais nem cria tenant FER real.
- Não altera projeto FER original.
- Não inicia SAAS-02-S3.
- Não tenantiza tabelas T-HER/G-PAR/G-GLB/A-ANA.

## 6. Riscos remanescentes

- Handoffs sem `assistido_id` ficam invisíveis via overload tenant-aware —
  documentado como fail-closed intencional; se necessário, resolver por
  `whatsapp_conversas.telefone` num recorte futuro (requer política de
  desambiguação por número).
- Regras operacionais `central_alerta_*` por tenant só entram no recorte de
  tenantização das regras (ainda não iniciado).

## 7. Testes executados

- `src/test/governanca/saas05eEdgeA2-fila-comunicadores.test.ts` — 22 casos.
- Suítes anteriores (E1..E4 e EDGE-A) permanecem verdes.
- `tsgo` e `build` limpos.

## 8. Indicadores (delta isolado ao EDGE-A2)

- 0028: +0 (baseline pré-existente inalterado)
- 0025: +0
- 0029: +2 (2 novos entrypoints autenticados tenant-aware: `fila_humana_pendente(uuid)` e `comunicadores_elegiveis(uuid)`)

## 9. Critério de aceite

- [x] `fila_humana_pendente` e `comunicadores_elegiveis` têm overload tenant-aware
- [x] `central-fila-alerta` chama overload quando há tenant resolvido
- [x] Assinaturas legadas preservadas (backward-compat até cutover)
- [x] Nenhum vazamento cross-tenant no filtro (validado por revisão SQL e testes)
- [x] Escopo EDGE-B/C/D não iniciado
- [x] RLS/policies/NOT NULL/cutover intactos
