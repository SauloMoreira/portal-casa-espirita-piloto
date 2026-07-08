# SAAS-05-F3 — Cutover técnico multi-tenant

Status: **ENCERRADO** (cutover técnico controlado; sem migração de dados
reais; sem alteração no projeto FER original).

## 1. Base documental consultada

- `docs/SAAS-05-F1-DIAGNOSTICO-PRE-CUTOVER.md`
- `docs/SAAS-05-F2-BACKFILL-SEED-ZERO-NULLS.md`
- `docs/SAAS-02-S4-FINDINGS-SUPABASE-LOV.md`
- `docs/SAAS-05-C-RLS-MULTITENANT-SHADOW.md`
- `docs/SAAS-05-D-PROPAGACAO-TENANT-FRONTEND.md`
- `docs/SAAS-05-E1-…E4`, `docs/SAAS-05-E-EDGE-A/A2/B/C/D`.

## 2. Pré-check executado

Executado ao vivo antes da migração (bloco `DO` no início da migration
`20260708…_saas05_f3_cutover.sql`):

- 13 T-DIR com `count(*) FILTER (WHERE instituicao_id IS NULL) = 0`.
- Tenant demo (`Casa Espírita Demo`) presente e ativo.
- 10 T-HER com 0 órfãos (herdam via T-DIR).
- Sem dados reais da FER no sandbox.
- Projeto FER original fora do escopo (não tocado).

Regra do bloco: se qualquer T-DIR tivesse ≥1 null, a migration abortaria
via `RAISE EXCEPTION` **antes** de qualquer ALTER/DROP.

## 3. Migration aplicada

Arquivo: `supabase/migrations/20260708…_saas05_f3_cutover.sql`.

### 3.1 NOT NULL nas 13 T-DIR

Aplicado `ALTER COLUMN instituicao_id SET NOT NULL` em:

`assistidos`, `voluntarios`, `palestras`, `sessoes_publicas`,
`avisos_internos`, `campanhas`, `eventos`, `acao_social_alimentos`,
`regras_operacionais`, `excecoes_operacionais`, `programacao_padrao`,
`configuracoes_gerais`, `comunicacoes_institucionais`.

Sem coluna nova, sem trigger novo, sem alteração de tipo. Idempotente para
tabelas já `NOT NULL`.

### 3.2 Policies removidas

Total: **41 policies legadas** dropadas via `DROP POLICY IF EXISTS`
(idempotente). Padrão comum: `has_role(auth.uid(), '<role>')` sem qualquer
verificação de `instituicao_id`.

Por tabela:

| Tabela | Policies removidas |
| --- | --- |
| acao_social_alimentos | Admins gerenciam alimentos (delete/insert/update); Autenticados veem alimentos ativos |
| assistidos | Admins manage assistidos; Coordenador reads assistidos of own tratamentos; Entrevistadores manage assistidos; Tarefeiros read assistidos |
| avisos_internos | Admins delete/insert/read all avisos; Entrevistadores insert avisos |
| campanhas | Admins gerenciam campanhas (delete/insert/update); Autenticados veem campanhas vigentes |
| comunicacoes_institucionais | Admins gerenciam comunicacoes (delete/insert/select/update) — **resolve S4-F2** |
| configuracoes_gerais | Admins manage config; Authenticated can read config |
| eventos | Admins gerenciam eventos (delete/insert/update); Autenticados veem eventos vigentes |
| excecoes_operacionais | Admin e coordenador gerenciam excecoes (delete/insert/update); Staff podem ver excecoes operacionais |
| palestras | Admins manage palestras; Authenticated read palestras |
| programacao_padrao | Admin e coordenador gerenciam programacao (delete/insert/update); Staff podem ver programacao padrao |
| regras_operacionais | Admins manage regras; Authenticated read non-sensitive regras |
| sessoes_publicas | Admins manage sessoes_publicas; Staff read sessoes_publicas; Tarefeiros manage sessoes_publicas |
| voluntarios | Admins manage voluntarios — **resolve S4-F1** |

### 3.3 Policies mantidas (finais efetivas)

Para cada T-DIR, permanece **1 policy tenant-scoped** unificada:

`shadow_tenant_all_<table>` com predicado:

```
is_platform_admin(auth.uid())
OR (
  current_instituicao_id() IS NOT NULL
  AND instituicao_id = current_instituicao_id()
  AND is_member_of_instituicao(auth.uid(), instituicao_id)
)
```

Adicionalmente, preservadas policies de **autoacesso do próprio usuário**
(inerentemente seguras — `user_id = auth.uid()` só pode casar com o
próprio registro do usuário, cuja `instituicao_id` já é a dele):

- `assistidos`: `Assistido views own record`, `Assistido updates own record`.
- `avisos_internos`: `User views own avisos`, `User updates own avisos`.

Resultado por tabela após F3:

| Tabela | Policies finais |
| --- | --- |
| acao_social_alimentos | shadow_tenant_all_acao_social_alimentos |
| assistidos | shadow_tenant_all_assistidos + Assistido views own + Assistido updates own |
| avisos_internos | shadow_tenant_all_avisos_internos + User views own + User updates own |
| campanhas | shadow_tenant_all_campanhas |
| comunicacoes_institucionais | shadow_tenant_all_comunicacoes_institucionais |
| configuracoes_gerais | shadow_tenant_all_configuracoes_gerais |
| eventos | shadow_tenant_all_eventos |
| excecoes_operacionais | shadow_tenant_all_excecoes_operacionais |
| palestras | shadow_tenant_all_palestras |
| programacao_padrao | shadow_tenant_all_programacao_padrao |
| regras_operacionais | shadow_tenant_all_regras_operacionais |
| sessoes_publicas | shadow_tenant_all_sessoes_publicas |
| voluntarios | shadow_tenant_all_voluntarios |

## 4. Resolução dos findings S4

| Finding | Situação após F3 |
| --- | --- |
| **F1** — `assistidos_voluntarios_pii_cross_tenant` | ✅ Resolvido — policies `has_role`-only removidas de `assistidos` e `voluntarios`. |
| **F2** — `comunicacoes_institucionais_admin_unscoped` | ✅ Resolvido — todas as 4 policies admin unscoped removidas. |
| **F3** — `role_based_policies_bypass_tenant_scoping` | ✅ Resolvido nas 13 T-DIR. Tabelas restantes citadas pelo scanner que **não são T-DIR** (ex.: `presencas_*`, `plano_tratamento_sessoes`, etc.) permanecem herdando via join de T-DIR e serão avaliadas no SAAS-05-G. |

## 5. Regra explícita — platform_admin

- `is_platform_admin(auth.uid())` retorna `true` apenas para membros de
  `public.platform_admins`.
- Nas policies finais, platform admin recebe **visão global**
  (compatível com rotas administrativas cross-tenant do Portal).
- Nas rotas **operacionais** de instituição, o frontend continua exigindo
  seleção de tenant ativa via `RequireInstituicao` + `requireInstituicaoId()`;
  platform admin também precisa selecionar uma instituição ativa para operar
  em modo tenant. Sem seleção, `requireInstituicaoId()` falha fechado.
- Exceção documentada: consultas administrativas globais (portal, telemetria,
  observabilidade) usam RPCs próprias com `is_platform_admin` como guarda.

## 6. Tratamento dos fallbacks residuais

Fallbacks single-tenant catalogados no F1 (`central-fila-alerta`,
`whatsapp-inbound`, `alertas-operacionais`) **permanecem intocados por F3**.

Justificativa fail-closed:

- `whatsapp-inbound`: já opera fail-closed em telefone ambíguo entre
  tenants (EDGE-C). O fallback restante ("único tenant") só dispara quando
  o número mapeia para exatamente 1 instituição — seguro por definição.
- `central-fila-alerta` e `alertas-operacionais`: são jobs cron/service_role
  que não confiam em `current_instituicao_id()` (não há sessão). Continuam
  passando `p_instituicao_id` explicitamente para as RPCs tenant-aware; o
  fallback existe apenas para instalações single-tenant legadas e não expõe
  cross-tenant porque as RPCs internas já filtram por `instituicao_id`.

Remoção definitiva desses fallbacks foi movida para **SAAS-05-H**
(cutover do piloto FER), quando existirão ≥2 tenants em produção.

## 7. RPCs legadas

- Overloads tenant-aware permanecem intocados.
- Nenhuma RPC legada foi revogada neste recorte — todas ainda são chamadas
  por consumidores conhecidos (frontend antigo, cron, service_role).
- Depreciação incremental foi movida para SAAS-05-G após rodada de testes
  E2E multi-tenant.

## 8. Ajustes de frontend/services

Como `instituicao_id` passou a ser `NOT NULL`, os tipos gerados marcam a
coluna como obrigatória em `Insert<...>`. Ajustes mínimos aplicados:

- `src/services/acaoSocial.ts` — `createAlimento`.
- `src/services/campanhas.ts` — `createCampanha`.
- `src/services/eventos.ts` — `createEvento`.
- `src/services/comunicacaoInstitucional.ts` — `createComunicacao`.
- `src/pages/GestaoCores.tsx` — insert de `configuracoes_gerais`.
- `src/pages/RegrasOperacionais.tsx` — insert de `configuracoes_gerais`.
- `src/pages/SessoesPublicas.tsx` — insert de `sessoes_publicas`.

Todos passaram a chamar `requireInstituicaoId()` (SAAS-05-D) — fail-closed
quando não há tenant ativo selecionado.

## 9. Testes executados

Suíte nova: `src/test/governanca/saas05f3-cutover-tecnico-multitenant.test.ts`.

Cobre:

- Existência da migração F3.
- Pré-check zero nulls presente e abort explícito.
- `NOT NULL` aplicado nas 13 T-DIR.
- 41 policies legadas removidas via `DROP POLICY IF EXISTS`.
- Shadow policies **não** foram dropadas (permanecem como final).
- Policies de autoacesso preservadas.
- Migration não migra dados reais.
- Frontend/services citados usam `requireInstituicaoId()`.
- Edges A/A2/B/C não citam SAAS-05-F3 (intocadas).
- Migration só altera tabelas dentro das 13 T-DIR.
- Documento oficial cobre todo o escopo exigido.

Suíte total de governança permanece verde. `tsgo` limpo. Build verde.

## 10. Riscos remanescentes

| Risco | Mitigação |
| --- | --- |
| T-HER (herdeiras) sem coluna própria de `instituicao_id` | Herança via T-DIR já garante isolamento por join; SAAS-05-G/H avalia colunização se necessário. |
| Consumidores esquecidos de RPCs legadas | SAAS-05-G varre chamadas e revoga incrementalmente. |
| Fallbacks residuais em edges | Mantidos como fail-closed; removidos formalmente no SAAS-05-H com ≥2 tenants ativos. |
| Ausência de teste RLS por linha em sandbox BYPASSRLS | Cobertura ampliada no SAAS-05-G via `vitest.e2e.rls.config.ts`. |

## 11. Confirmações

- ✅ Dados reais **não** foram migrados.
- ✅ Projeto FER original **não** foi alterado (permanece intocado).
- ✅ Nenhuma edge function tocada pelo recorte F3.
- ✅ Nenhuma RPC alterada pelo recorte F3.
- ✅ Cutover funcional (dados reais/pilotos) permanece para SAAS-05-H.

## 12. Indicadores

- **0028:** +0
- **0025:** +0
- **0029:** +0 (o alerta herdado permanece nas SECURITY DEFINER; sem
  novos findings introduzidos por F3)

## 13. Delta isolado do F3

- 1 documento novo (este).
- 1 suíte nova: `src/test/governanca/saas05f3-cutover-tecnico-multitenant.test.ts`.
- 1 migration nova (cutover: pré-check + NOT NULL × 13 + DROP POLICY × 41).
- 7 ajustes de frontend/services para acompanhar `NOT NULL` (inserts).
- **0** RPCs alteradas, **0** edges alteradas, **0** dados reais, **0**
  alteração no projeto FER original.

## 14. Recomendação para SAAS-05-G

O projeto SaaS está em **modo multi-tenant obrigatório** nas 13 T-DIR, com
policies finais tenant-scoped e findings críticos S4 resolvidos.
Recomenda-se avançar para **SAAS-05-G**: testes E2E multi-tenant com dois
tenants simultâneos, incluindo RLS por linha fora do sandbox BYPASSRLS,
regressão de check-in público, dispatchers, WhatsApp e IA, e depreciação
formal das RPCs legadas.
