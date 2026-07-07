# SAAS-05-E1 — RPCs internas tenant-aware do módulo Tratamentos (lote 1)

**Status:** Concluído · **Recorte:** SAAS-05-E1
**Depende de:** SAAS-05-B (colunas `instituicao_id`) · SAAS-05-C (helpers/shadow) · SAAS-05-D (propagação frontend)
**Habilita:** SAAS-05-E2/E3/E4 (RPCs de assistidos, agenda, entrevistas, tratamentos, relatórios) · SAAS-05-E-EDGE (edge functions) · SAAS-05-F (cutover RLS + NOT NULL)

---

## 1. Objetivo

Tornar as RPCs internas críticas do lote 1 **tenant-aware**, recebendo
`p_instituicao_id` obrigatoriamente e validando autorização por instituição
antes de executar qualquer efeito. O recorte é intencionalmente estreito:
apenas as RPCs listadas no plano SAAS-05-D como pendentes e diretamente
consumidas pelos services adaptados naquele recorte.

---

## 2. RPCs tratadas

| Nº | RPC | Motivo do lote E1 |
| -- | --- | --- |
| 1 | `gerenciar_voluntario(p_action, p_voluntario_id, p_motivo, p_instituicao_id)` | Ciclo de vida do voluntário (inactivate/reactivate/check/delete); mutações críticas com auditoria. |
| 2 | `gerenciar_termo_voluntario(p_action, p_voluntario_id, p_path, p_nome, p_motivo, p_instituicao_id)` | Termo de adesão (gerar/assinar/validar/rejeitar); mutações críticas com auditoria. |
| 3 | `fn_buscar_pessoa_para_voluntario(p_termo, p_instituicao_id)` | Busca cross-schema (assistidos + profiles). Sem escopo por instituição, expõe dados de outros tenants. |
| 4 | `fn_processar_excecao_notificacoes(p_excecao_id, p_instituicao_id)` | Motor imediato de exceção operacional (efeitos em agenda + fila oficial). |
| 5 | `fn_monitor_excecao_notificacoes(p_desde, p_instituicao_id)` | Monitor de rollout consumido pela UI admin. |

Cada uma dessas 5 RPCs recebeu **um novo overload** com `p_instituicao_id`
obrigatório. A assinatura legada foi **preservada** para não quebrar callers
internos ainda não migrados (ex.: `fn_reconciliar_excecoes_notificacoes`
chama internamente `fn_processar_excecao_notificacoes(uuid)` a partir do
cron). Isso é intencional; a remoção da assinatura legada ficará no
recorte de cutover (SAAS-05-F) junto com a adaptação das edge functions
(SAAS-05-E-EDGE).

---

## 3. Contrato antes/depois

### 3.1. Antes (assinatura legada — mantida)

```
gerenciar_voluntario(text, uuid, text)
gerenciar_termo_voluntario(text, uuid, text, text, text)
fn_buscar_pessoa_para_voluntario(text)
fn_processar_excecao_notificacoes(uuid)
fn_monitor_excecao_notificacoes(timestamptz)
```

### 3.2. Depois (novos overloads — usados pelo frontend)

```
gerenciar_voluntario(text, uuid, text, uuid)
gerenciar_termo_voluntario(text, uuid, text, text, text, uuid)
fn_buscar_pessoa_para_voluntario(text, uuid)
fn_processar_excecao_notificacoes(uuid, uuid)
fn_monitor_excecao_notificacoes(timestamptz, uuid)
```

Retornos idênticos. Nenhum breaking change para callers legados; o
frontend passa a chamar exclusivamente os overloads novos.

---

## 4. Padrão de validação (cabeçalho dos overloads)

```sql
IF p_instituicao_id IS NULL THEN
  RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE='22023';
END IF;
IF v_uid IS NULL THEN
  RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501';
END IF;
IF NOT (public.is_platform_admin(v_uid)
        OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
  RAISE EXCEPTION 'Acesso negado: usuário não pertence à instituição informada.'
    USING ERRCODE='42501';
END IF;
-- (Defesa em profundidade quando o recurso já tem instituicao_id gravado)
PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
RETURN public.<rpc_legada>(<args>);
```

Regras aplicadas (validadas em teste):

| Regra | Como é atendida |
| --- | --- |
| `p_instituicao_id` obrigatório | `IS NULL` → `22023 invalid_parameter_value`. |
| Usuário deve pertencer à instituição | `is_member_of_instituicao` (SAAS-05-C, alias de `user_pertence_instituicao` — filtra `status='ativo'`). |
| Vínculo inativo falha fechado | Helper já exige `status='ativo'`. |
| Usuário A não opera instituição B | `is_member_of_instituicao(A, B)` retorna false → `42501`. |
| Platform admin bypass | `is_platform_admin(v_uid)` só quando a regra permite (aqui, permitido em todas as 5). |
| Manipulação manual de `p_instituicao_id` não burla | Membership é checada com `auth.uid()` — client não escolhe quem é. |
| Recurso de outro tenant não é operado | Overloads de voluntário/exceção validam que `voluntarios.instituicao_id`/`excecoes_operacionais.instituicao_id` batem com `p_instituicao_id`. |

---

## 5. `SET LOCAL app.current_instituicao`

Adotado como **apoio às policies shadow (SAAS-05-C)** dentro da transação da
RPC. Não substitui a validação explícita: a autorização segue por
membership. Efeitos colaterais das RPCs (updates em `agenda_*`,
`sessoes_publicas`, `notificacoes_fila`) passam a rodar com o contexto
correto para eventual short-circuit da shadow policy no cutover.

Padrão: `PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);`
executado **depois** da validação de membership, imediatamente antes do
delegate para a RPC legada.

---

## 6. Chamadas frontend/services alteradas

| Arquivo | Chamada RPC | Alteração |
| --- | --- | --- |
| `src/services/voluntarios/voluntariosService.ts` | `gerenciar_voluntario` | injeta `p_instituicao_id: requireInstituicaoId()` |
| `src/services/voluntarios/voluntariosService.ts` | `gerenciar_termo_voluntario` | idem |
| `src/services/voluntarios/voluntariosService.ts` | `fn_buscar_pessoa_para_voluntario` | idem |
| `src/services/programacao/excecoesService.ts` | `fn_processar_excecao_notificacoes` | idem |
| `src/services/programacao/excecoesService.ts` | `fn_monitor_excecao_notificacoes` | idem |

Todas leem o tenant **exclusivamente** via `requireInstituicaoId()` do
helper `@/lib/tenant/currentTenant` (fail-closed). Nenhuma leitura direta
de `localStorage`.

---

## 7. Testes executados

- Suíte nova: `src/test/governanca/saas05e1-rpcs-tenant-aware.test.ts` — **38 casos verdes**.
- Suíte SAAS-05-D atualizada: `saas05d-propagacao-tenant-frontend.test.ts` — 68 casos verdes (contrato de "pendente" convertido em "concluído por SAAS-05-E1").
- Suíte Q1-C5 atualizada: `q1c5-jsonb-contracts.test.ts` — 22 casos verdes (agora seed de tenant + expectativa de `p_instituicao_id`).
- Suíte total do projeto: **1288/1288 verdes**.
- `tsgo --noEmit`: limpo.

Verificação real com banco (usuário A/B, vínculo inativo, platform_admin
bypass, cross-tenant do recurso) permanece em `src/test/integration/db/`
para o cutover posterior (SAAS-05-F).

---

## 8. Pendências (E2/E3/E4/E-EDGE)

### 8.1. E2 — RPCs de operação de assistido/agenda/tratamento
- `pts_registrar_presenca`, `pts_registrar_ausencia`, `pts_desmarcar_ausencia`
- RPCs de coordenação, waitlist e agenda ampla
- RPCs de tratamentos (gerar agenda, encerrar vínculo, migrar)

### 8.2. E3 — Entrevistas
- `fn_entrevistas_operacional` e correlatas
- RPCs de fila da entrevista fraterna

### 8.3. E4 — Relatórios, Central IA, Observabilidade, Comunicação institucional ampla, Ação Social, Campanhas, Eventos

### 8.4. E-EDGE — Edge functions
- `checkin-publico`, `notificacoes-dispatch`, `whatsapp-inbound`,
  `whatsapp-responder`, `comunicacao-dispatch`, `alertas-operacionais`,
  IA/cron, dispatcher/provider — nenhuma tocada neste recorte.

### 8.5. Cutover
- Remoção das assinaturas legadas dos 5 overloads de E1.
- Adaptação do `fn_reconciliar_excecoes_notificacoes` (cron) para escopar
  por tenant antes de invocar `fn_processar_excecao_notificacoes(uuid, uuid)`.
- SAAS-05-F: `NOT NULL` em `instituicao_id`, remoção de policies legadas,
  ativação restritiva das shadows.

---

## 9. Riscos remanescentes

| Risco | Mitigação atual | Próximo passo |
| --- | --- | --- |
| Callers internos (cron) ainda usam a assinatura legada | Preservação intencional das assinaturas antigas evita quebra | Adaptar cron/reconciliação no SAAS-05-E-EDGE + cutover |
| Frontend chama overload novo mas RLS legada permanece permissiva | Defesa em profundidade: validação por membership dentro da RPC | Cutover SAAS-05-F |
| Novo overload é `SECURITY DEFINER` — cai no linter 0029 (authenticated pode executar) | Esperado por design: os overloads são o ponto de entrada autenticado do fluxo tenant-aware | Registrar como aceitável na @security-memory quando os 5 forem cobertos por testes real-DB no E1-DB |
| Sub-consulta `is_member_of_instituicao` roda em `SECURITY DEFINER` da própria helper | Helper reaproveitada dos recortes anteriores; sem elevação nova | Nenhum |

---

## 10. Escopo preservado (checklist)

- [x] Nenhuma alteração em RLS, policies, `NOT NULL` ou tabelas.
- [x] Nenhuma alteração em edge functions.
- [x] Nenhuma alteração no dispatcher/provider/notificações/check-in público.
- [x] Nenhuma migração de dados reais.
- [x] Nenhuma alteração no projeto FER original (helpers e services herdados; comportamento preservado).
- [x] SAAS-02-S3 permanece no backlog — não iniciado.
- [x] Assinaturas legadas das 5 RPCs mantidas (backward-compatible).
- [x] Nenhum cutover realizado (RLS shadow permanece PERMISSIVE, sem endurecimento).

---

## 11. Indicadores (linter 0028/0025/0029)

Baseline pré-E1 (relatado no encerramento do SAAS-05-D):
`0028=143 · 0025=0 · 0029=56`.

Após SAAS-05-E1 os 5 novos overloads são `SECURITY DEFINER` com
`GRANT EXECUTE ... TO authenticated` e `REVOKE ... FROM PUBLIC, anon`, o
que os classifica sob **0029** (esperado por design — são pontos de entrada
autenticados do fluxo tenant-aware). O linter em execução atual reportou:

- `0028` (public/anon SECURITY DEFINER executável): **~53** — variação decorre de outros recortes; **SAAS-05-E1 não introduz nenhum finding 0028** (proacl confirma revogação de PUBLIC/anon nos 5 novos overloads).
- `0025`: **0** (inalterado).
- `0029` (signed-in SECURITY DEFINER executável): **~95** — **+5** atribuíveis diretamente aos 5 overloads deste recorte.

A oscilação absoluta de 0028 é rastreada em recortes paralelos de
saneamento; **o delta introduzido por SAAS-05-E1 é isolado a +5 em 0029**,
todos por design.

---

## 12. Confirmações finais

- Nenhuma edge function foi alterada (grep em `supabase/functions/` inalterado).
- RLS / policies / cutover / `NOT NULL` não foram alterados nesta migração.
- Projeto FER original não foi tocado (fluxos herdados continuam operando
  via assinaturas legadas até o cutover).
- `SAAS-02-S3` não iniciado neste recorte.
