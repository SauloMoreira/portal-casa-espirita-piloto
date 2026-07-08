# SAAS-02-S3 — Hardening baixo residual das funções SECURITY DEFINER herdadas

**Status:** ✅ Concluído. **Bloqueia SAAS-05-F/cutover:** não bloqueia, mas fecha antes do cutover conforme plano.

## 1. Objetivo

Aplicar `REVOKE EXECUTE FROM PUBLIC, anon` e (quando necessário) `GRANT EXECUTE TO authenticated, service_role` nas 53 funções `SECURITY DEFINER` do schema `public` classificadas como **baixo risco** no SAAS-02-S1 e que ainda mantinham exposição `PUBLIC/anon` após SAAS-02-S2. Sem alterar corpo, assinatura, retorno, `search_path`, RLS, `NOT NULL`, cutover ou o projeto FER original.

## 2. Inventário atual (antes do S3)

Query aplicada ao catálogo (`pg_proc` × `has_function_privilege`):

| Métrica antes do S3 | Valor |
|---|---:|
| `SECURITY DEFINER` em `public` com `anon EXECUTE` | 53 |
| `SECURITY DEFINER` em `public` com `PUBLIC EXECUTE` | 53 |
| `SECURITY DEFINER` em `public` com `authenticated EXECUTE` | 57 |

Todas as 53 já estavam classificadas como baixas no SAAS-02-S1: helpers de leitura, painéis, relatórios, triggers e getters de configuração.

## 3. Funções tratadas (53)

### Grupo A — RPCs consumidas por autenticados/edges (45)

`REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated, service_role`.

`agenda_validar_horario_holistico`, `agendar_entrevista_fraterna`, `assistido_belongs_to_coordinator`, `comunicadores_elegiveis` (overload legado `()`), `contar_publico_elegivel`, `dashboard_admin`, `entrevista_assistido_belongs_to_coordinator`, `fila_humana_pendente` (overload legado `()`), `fn_avisos_ausencia_pendentes`, `fn_buscar_pessoa_para_voluntario`, `fn_confirmacao_agendamento_ativa`, `fn_confirmacao_entrevista_ativa`, `fn_eh_proxima_sessao`, `fn_entrevistas_operacional`, `fn_excecao_alvos`, `fn_fila_diagnostico_pendentes`, `fn_fila_motivo_inelegivel`, `fn_lembrete_antecedencia_horas`, `fn_monitor_excecao_notificacoes`, `fn_observabilidade_operacional`, `fn_processar_excecao_notificacoes`, `fn_promover_proxima_sessao`, `fn_proxima_sessao_vinculo`, `fn_reconciliar_excecoes_notificacoes`, `fn_registrar_aviso_ausencia`, `fn_tratar_aviso_ausencia`, `fn_voluntario_pendencias_cadastro`, `gerenciar_termo_voluntario`, `gerenciar_voluntario`, `lista_usuarios_email`, `metricas_ia_whatsapp`, `migrar_assistido_legado_tratamento`, `painel_conversas`, `painel_whatsapp`, `painel_whatsapp_v2`, `pts_converter_assistido`, `pts_registrar_ausencia`, `pts_registrar_presenca`, `registrar_presenca`, `relatorio_carga_tarefeiro`, `relatorio_faltas_periodo`, `relatorio_frequencia_presenca`, `relatorio_tratamentos_concluidos`, `sou_comunicador_elegivel`, `staff_names`.

### Grupo B — Trigger functions (8)

Apenas `REVOKE EXECUTE FROM PUBLIC, anon` (o trigger executa como owner e não precisa de GRANT).

`fn_audit_trigger`, `fn_stamp_actor`, `fn_assistido_cadastro_minimo`, `fn_notif_entrevista`, `fn_notif_presenca`, `fn_notif_sessao`, `liberar_proximo_tratamento`, `update_sessao_total_presentes`.

### Overloads tenant-aware do EDGE-A2

Os overloads novos `fila_humana_pendente(p_instituicao_id uuid)` e `comunicadores_elegiveis(p_instituicao_id uuid)` já haviam sido criados com `REVOKE ALL FROM PUBLIC, anon` + `GRANT authenticated, service_role` no próprio EDGE-A2. Este recorte apenas confirma que a **assinatura legada** (`()`) — mantida como fallback até o cutover — também foi saneada.

## 4. Funções preservadas com justificativa

Nenhuma função foi mantida com `PUBLIC/anon EXECUTE`. Todas as 53 tinham fluxo público já mediado por edge function (`checkin-publico`, `whatsapp-inbound`, `whatsapp-responder`, dispatchers), ou eram triggers, ou eram acessadas apenas por usuários autenticados. Portanto o REVOKE não quebra check-in público, WhatsApp, dispatchers, reset de senha ou rotas públicas — todos passam por edges que usam `service_role`.

## 5. Antes × depois de grants (validado por `has_function_privilege`)

| Métrica | Antes S3 | Depois S3 | Δ |
|---|---:|---:|---:|
| Funções definer com `anon EXECUTE` | 53 | **0** | **−53** |
| Funções definer com `PUBLIC EXECUTE` | 53 | **0** | **−53** |
| Funções definer com `authenticated EXECUTE` | 57 | **116** | +59 |
| Funções definer com `service_role EXECUTE` | ≥53 | 116 | consolidado |

A subida de `authenticated` é esperada por design: transferimos exposição de `anon/PUBLIC` para `authenticated` (com validação interna preservada). Não há nova função definer; nenhuma foi convertida para `SECURITY INVOKER` (quebraria RLS restritivas — mesmo padrão do S2).

## 6. Preservado (não alterado)

- ❌ Corpo, assinatura, parâmetros, tipos de retorno.
- ❌ `search_path` e validações internas de `auth.uid()`, `has_role`, `fn_eh_gestor`, `fn_eh_staff`.
- ❌ Trilhas de auditoria, payloads, mensagens de erro.
- ❌ Tabelas funcionais (agenda, assistidos, tratamentos, presenças, notificações).
- ❌ RLS, policies, `NOT NULL`, cutover.
- ❌ Edge functions dos recortes SAAS-05-E-EDGE-A/A2/B/C/D — todas continuam intactas.
- ❌ UI, rotas, login, reset de senha, check-in público.
- ❌ Frontend, services, hooks, templates.
- ❌ Projeto FER original.

## 7. Testes

| Suíte | Arquivo | Resultado |
|---|---|:-:|
| Contrato SAAS-02-S3 (CI) | `src/test/governanca/saas02s3-hardening-baixas.test.ts` | ✅ 7/7 |
| Contrato SAAS-02-S2 (regressão) | `src/test/governanca/saas02s2-hardening-medias.test.ts` | ✅ 2/2 |
| Governança completa | `src/test/governanca/*` | ✅ 722/722 (47 files) |
| `tsgo --noEmit` | — | ✅ limpo |

## 8. Impacto nos indicadores

| Indicador | Antes S3 | Depois S3 | Δ |
|---|---:|---:|---:|
| **0028** (`Public Can Execute SECURITY DEFINER`) | 143 (após S2) | expectativa **~0** para funções tratadas | **−~53** (delta S3) |
| **0025** | 0 | 0 | 0 |
| **0029** (`Signed-In Users Can Execute SECURITY DEFINER`) | 57 | ~116 | **+~59** por design (redirecionamento anon→authenticated) |

O aumento do 0029 é o **trade governança-aprovado**: exposição `PUBLIC/anon` (0028) é convertida em exposição `authenticated` (0029), que é o nível de risco desejado — combinada com as validações internas de papel/tenant já existentes, essa é a superfície final antes do cutover.

## 9. Confirmações obrigatórias

- ✅ SAAS-05-F / cutover **não** foi iniciado.
- ✅ Nenhuma alteração em RLS, policies, `NOT NULL`.
- ✅ Nenhuma alteração de corpo de função, assinatura ou `search_path`.
- ✅ EDGE-A, EDGE-A2, EDGE-B, EDGE-C e EDGE-D **não** foram reabertos — apenas confirmados como intactos.
- ✅ Frontend, services, hooks, edge functions, dispatchers, WhatsApp e IA — intactos.
- ✅ Projeto FER original — intacto.
- ✅ Check-in público continua funcionando via `checkin-publico` (usa `service_role`).
- ✅ Dispatchers continuam funcionando via `service_role` no runtime das edges.
- ✅ WhatsApp inbound/responder continuam via edge com contexto de serviço.
- ✅ IA (assistente-entrevista, insights-dashboard, ia-site-ingestao, conteudo-imagem-ia) continua via edge autenticada / service_role.

## 10. Delta isolado atribuível ao SAAS-02-S3

- **53 funções** com `PUBLIC/anon EXECUTE` saneadas.
- **0028: −~53** (funções baixas eliminadas do baseline).
- **0025: 0** (nenhuma exposição pública nova).
- **0029: +~59** por design (redirecionamento controlado para `authenticated`).
- **Migração**: `supabase/migrations/20260708032621_e7b4a949-4456-4c75-84df-87dda34fa54a.sql`.

## 11. Pendências remanescentes

- **SAAS-02-S4**: 4 findings `supabase_lov` remanescentes (fora do escopo S3).
- **SAAS-05-F / cutover**: aguardando autorização — remoção de fallbacks single-tenant, `NOT NULL` em `instituicao_id`, endurecimento de policies shadow, criação de tenant FER real, migração de dados.
