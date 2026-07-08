# SAAS-05-E4 — RPCs tenant-aware de Relatórios, Dashboards, Observabilidade e Central IA

## Contexto
Lote 4 da série SAAS-05-E. Continua o padrão dos lotes E1/E2/E3: cria novos
overloads das RPCs internas com `p_instituicao_id` obrigatório, mantendo a
assinatura legada intacta (backward-compat até o cutover em SAAS-05-F).

Nenhuma alteração em:
- RLS / policies (legadas ou shadow);
- NOT NULL / cutover / tabelas T-DIR / T-HER;
- edge functions, dispatcher, provider, WhatsApp, check-in público;
- projeto FER original.

## Inventário
Chamadas `supabase.rpc(...)` relacionadas a relatórios, dashboards,
observabilidade e Central IA encontradas no frontend:

| RPC | Origem | Situação |
|---|---|---|
| `dashboard_admin` | `src/services/dashboard/adminDashboard.ts` | **Tratada no E4** |
| `relatorio_tratamentos_concluidos` | `src/services/relatorios/tratamentosConcluidos.ts` | **Tratada no E4** |
| `relatorio_carga_tarefeiro` | `src/services/relatorios/cargaTarefeiro.ts` | **Tratada no E4** |
| `relatorio_frequencia_presenca` | `src/services/relatorios/frequencia.ts` | **Tratada no E4** |
| `relatorio_faltas_periodo` | `src/services/relatorios/faltas.ts` | **Tratada no E4** |
| `fn_observabilidade_operacional` | `src/services/observabilidade/observabilidadeService.ts` | **Tratada no E4** |
| `metricas_ia_whatsapp` | `src/components/central-ia/MetricasWhatsApp.tsx` | **Tratada no E4** |
| `staff_names` | `src/services/agenda/agendaEntrevistas.ts`, `src/components/relatorios/*` | UI helper, fora do lote |
| `painel_conversas`, `painel_whatsapp_v2` | `src/services/notificacoes/notificacoesService.ts` | WhatsApp, fora do lote |
| `contar_publico_elegivel`, `preparar_envio_institucional` | `src/services/comunicacaoInstitucional.ts` | Comunicação institucional, fora do lote |
| `fn_monitor_excecao_notificacoes` | `src/services/programacao/excecoesService.ts` | Já tratada no E1 |

## RPCs tratadas no E4
1. `dashboard_admin(date, date, uuid)`
2. `relatorio_tratamentos_concluidos(date, date, uuid, text, uuid, uuid, integer, integer, uuid)`
3. `relatorio_carga_tarefeiro(date, date, uuid, uuid, integer, integer, uuid)`
4. `relatorio_frequencia_presenca(date, date, uuid, uuid, uuid, uuid, integer, integer, uuid)`
5. `relatorio_faltas_periodo(date, date, uuid, uuid, uuid, uuid, integer, integer, uuid)`
6. `fn_observabilidade_operacional(text, uuid)`
7. `metricas_ia_whatsapp(timestamptz, timestamptz, uuid)`

## Contrato antes/depois
- **Antes:** RPCs sem noção de tenant. Agregações abrangiam dados de todas as
  instituições (visíveis ao perfil/role do usuário).
- **Depois:** novo overload adiciona `p_instituicao_id uuid` obrigatório,
  aplica validação em cascata e reimplementa a agregação com filtro explícito
  por tenant (join com T-DIR pai).

## Padrão de validação (idêntico a E1/E2/E3)
1. `p_instituicao_id IS NULL` → `RAISE ... ERRCODE='22023'`.
2. `auth.uid() IS NULL` → `RAISE ... ERRCODE='42501'`.
3. `is_platform_admin(v_uid) OR is_member_of_instituicao(v_uid, p_instituicao_id)`
   caso contrário → `RAISE ... ERRCODE='42501'`.
4. `PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true)`.
5. Reimplementa a consulta com filtro por tenant.

## Regras de filtro por tenant (T-HER → T-DIR)
Nenhuma T-HER recebeu `instituicao_id` neste recorte. O tenant do recurso é
derivado por join com a T-DIR pai:

| RPC | Join / regra de filtro |
|---|---|
| `dashboard_admin` | `assistidos.instituicao_id` em todas as agregações; `palestras.instituicao_id` para `presencas_palestras`. |
| `relatorio_tratamentos_concluidos` | `assistido_tratamentos → assistidos.instituicao_id`. |
| `relatorio_carga_tarefeiro` | `agenda_tratamentos_assistido` / `presencas_tratamentos` / `assistido_tratamentos` → `assistidos.instituicao_id`. |
| `relatorio_frequencia_presenca` | `presencas_tratamentos → assistido_tratamentos → assistidos.instituicao_id`. |
| `relatorio_faltas_periodo` | `presencas_tratamentos → assistido_tratamentos → assistidos.instituicao_id`. |
| `fn_observabilidade_operacional` | `notificacoes_fila → assistidos.instituicao_id`; `notificacoes_log → notificacoes_fila → assistidos`; `avisos_ausencia → assistidos`; `whatsapp_handoffs → whatsapp_conversas → assistidos`. |
| `metricas_ia_whatsapp` | `notificacoes_log → notificacoes_fila → assistidos` OU `notificacoes_log → whatsapp_conversas (telefone) → assistidos`; `whatsapp_handoffs → whatsapp_conversas → assistidos`. |

Registros com `instituicao_id IS NULL` são tratados como legado (permitidos
até o backfill/cutover em SAAS-05-F).

## SET LOCAL app.current_instituicao
Aplicado após a validação de autorização, via
`set_config('app.current_instituicao', p_instituicao_id::text, true)`.
GUC não é usado como controle de segurança — a autorização e o filtro por
tenant são revalidados explicitamente nos joins.

## Chamadas frontend/services alteradas
- `src/services/dashboard/adminDashboard.ts` — `dashboard_admin`.
- `src/services/relatorios/cargaTarefeiro.ts` — `relatorio_carga_tarefeiro`.
- `src/services/relatorios/faltas.ts` — `relatorio_faltas_periodo`.
- `src/services/relatorios/frequencia.ts` — `relatorio_frequencia_presenca`.
- `src/services/relatorios/tratamentosConcluidos.ts` — `relatorio_tratamentos_concluidos`.
- `src/services/observabilidade/observabilidadeService.ts` — `fn_observabilidade_operacional`.
- `src/components/central-ia/MetricasWhatsApp.tsx` — `metricas_ia_whatsapp`.

Todos injetam `p_instituicao_id: requireInstituicaoId()` (fail-closed, sem
`localStorage`).

## Testes
- `src/test/governanca/saas05e4-rpcs-tenant-aware.test.ts` — cobre:
  contratos dos 7 overloads (parâmetro, NOT NULL, auth, membership,
  filtro por tenant, SET LOCAL, REVOKE/GRANT), assinaturas legadas
  preservadas, chamadas frontend/services enviando `p_instituicao_id`.
- Ajustes nos testes unitários dos services para refletir o novo parâmetro.

## Pendências para recortes futuros
- `staff_names` (UI helper) — ainda sem tenant.
- `painel_conversas` / `painel_whatsapp_v2` — WhatsApp, aguardando E-EDGE.
- `contar_publico_elegivel` / `preparar_envio_institucional` — comunicação
  institucional.
- Coordenação (`fn_tratamentos_do_coordenador`, etc.).
- Cutover de policies legadas e `NOT NULL` em SAAS-05-F.
- Edge functions em SAAS-05-E-EDGE.

## Indicadores (delta isolado)
- 0028: +0 (novos overloads tiveram REVOKE de PUBLIC/anon).
- 0025: +0.
- 0029: +7 (esperado por design — 7 novos entrypoints autenticados
  tenant-aware).
