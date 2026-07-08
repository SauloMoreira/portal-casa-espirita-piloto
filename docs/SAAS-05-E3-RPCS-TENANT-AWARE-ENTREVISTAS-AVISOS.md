# SAAS-05-E3 — RPCs tenant-aware de Entrevistas e Avisos de Ausência

## Contexto
Lote 3 da série SAAS-05-E. Continua o padrão dos lotes E1 e E2: cria novos
overloads das RPCs internas com `p_instituicao_id` obrigatório, mantendo a
assinatura legada intacta (backward-compat até o cutover em SAAS-05-F).

Nenhuma alteração em:
- RLS / policies (legadas ou shadow);
- NOT NULL / cutover / tabelas T-DIR / T-HER;
- edge functions, dispatcher, provider, WhatsApp, check-in público;
- projeto FER original.

## Inventário
Chamadas `supabase.rpc(...)` relacionadas a entrevistas e avisos de ausência
encontradas no frontend:

| RPC | Origem | Situação |
|---|---|---|
| `fn_entrevistas_operacional` | `src/pages/Entrevistas.tsx`, `src/components/CartaAgendamento.tsx` | **Tratada no E3** |
| `agendar_entrevista_fraterna` | `src/pages/Entrevistas.tsx` | **Tratada no E3** |
| `fn_registrar_aviso_ausencia` | `src/services/avisos/avisosAusenciaService.ts` | **Tratada no E3** |
| `fn_tratar_aviso_ausencia` | `src/services/avisos/avisosAusenciaService.ts` | **Tratada no E3** |
| `fn_avisos_ausencia_pendentes` | `src/services/avisos/avisosAusenciaService.ts` | **Tratada no E3** |
| `staff_names` (uso em `agendaEntrevistas.ts`) | apoio a UI, não é RPC operacional de entrevista | Fora do lote |

Nenhuma RPC de coordenação, `tipos_tratamento` ou dispatcher foi tratada
neste recorte.

## RPCs tratadas no E3
1. `agendar_entrevista_fraterna(uuid, timestamptz, text, text, uuid)`
2. `fn_entrevistas_operacional(timestamptz, timestamptz, uuid, uuid)`
3. `fn_registrar_aviso_ausencia(text, uuid, text, uuid)`
4. `fn_tratar_aviso_ausencia(uuid, text, text, uuid)`
5. `fn_avisos_ausencia_pendentes(boolean, uuid)`

## Contrato antes/depois
- **Antes:** RPCs sem noção de tenant. Pertinência apenas por role/RLS.
- **Depois:** novo overload adiciona `p_instituicao_id uuid` obrigatório,
  aplica validação em cascata e delega para a assinatura legada.

## Padrão de validação (idêntico a E1/E2)
1. `p_instituicao_id IS NULL` → `RAISE ... ERRCODE='22023'`.
2. `auth.uid() IS NULL` → `RAISE ... ERRCODE='42501'`.
3. `is_platform_admin(v_uid) OR is_member_of_instituicao(v_uid, p_instituicao_id)`
   caso contrário → `RAISE ... ERRCODE='42501'`.
4. Pertinência do recurso ao tenant (ver join abaixo). Falha → `42501`.
5. `PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true)`.
6. Delega à assinatura legada (ou executa a SELECT com filtro extra por tenant
   no caso de `fn_entrevistas_operacional` / `fn_avisos_ausencia_pendentes`).

## Regras de join (T-HER → T-DIR)
Nenhuma T-HER recebeu `instituicao_id` neste recorte. O tenant do recurso
é derivado por join com a T-DIR pai:

| RPC | Join / regra |
|---|---|
| `agendar_entrevista_fraterna` | `assistidos.id = _assistido_id` → `assistidos.instituicao_id` |
| `fn_entrevistas_operacional` | `entrevistas_fraternas → assistidos.instituicao_id` (com `_id` e no filtro do `RETURN QUERY`) |
| `fn_registrar_aviso_ausencia` | `assistidos.user_id = v_uid` → `assistidos.instituicao_id` (titular autenticado) |
| `fn_tratar_aviso_ausencia` | `avisos_ausencia → assistidos.instituicao_id` |
| `fn_avisos_ausencia_pendentes` | filtro `a.instituicao_id IS NULL OR a.instituicao_id = p_instituicao_id` no `RETURN QUERY` |

Registros com `instituicao_id IS NULL` são tratados como legado (permitidos
até o backfill/cutover em SAAS-05-F).

## SET LOCAL app.current_instituicao
Aplicado após a validação de autorização, via
`set_config('app.current_instituicao', p_instituicao_id::text, true)`.
GUC não é usado como controle de segurança — a autorização e a pertinência
sempre são revalidadas.

## Chamadas frontend/services alteradas
- `src/services/avisos/avisosAusenciaService.ts` — 3 RPCs, injeta
  `p_instituicao_id: requireInstituicaoId()`.
- `src/pages/Entrevistas.tsx` — `fn_entrevistas_operacional` e
  `agendar_entrevista_fraterna`.
- `src/components/CartaAgendamento.tsx` — `fn_entrevistas_operacional`
  (fluxo de reimpressão de carta).

Nenhum arquivo lê tenant de `localStorage`. Todos usam
`requireInstituicaoId()` (fail-closed).

## Testes
- `src/test/governanca/saas05e3-rpcs-tenant-aware.test.ts` — cobre:
  contratos dos 5 overloads (parâmetro, NOT NULL, auth, membership,
  pertinência, SET LOCAL, REVOKE/GRANT), assinaturas legadas preservadas,
  chamadas frontend/services enviando `p_instituicao_id`, e ausência de
  alteração em RLS/policies/NOT NULL/tabelas/edge functions.

## Pendências para recortes futuros
- Coordenação e `tipos_tratamento` (parametrização por tenant).
- Sugestões IA vinculadas à entrevista (nenhuma RPC interna dedicada
  encontrada no frontend; permanece coberto pelas RPCs de agenda/plano
  tratadas em E2 quando aplicável).
- Cutover de policies legadas e `NOT NULL` em SAAS-05-F.
- Edge functions em SAAS-05-E-EDGE.

## Indicadores (delta isolado)
- 0028: +0
- 0025: +0
- 0029: +5 (esperado por design — 5 novos entrypoints autenticados
  tenant-aware).
