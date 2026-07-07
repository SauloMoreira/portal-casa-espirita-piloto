# SAAS-05-D — Propagação frontend do tenant ativo e guard `RequireInstituicao`

**Status:** Concluído · **Recorte:** SAAS-05-D
**Depende de:** SAAS-04 (TenantSwitcher persistente) · SAAS-05-B (schema T-DIR) · SAAS-05-C (RLS shadow)
**Habilita:** SAAS-05-E (adaptação de RPCs/edge functions) → SAAS-05-F (cutover RLS + `NOT NULL`)

---

## 1. Objetivo

Propagar o contexto da instituição ativa do frontend para os services/hooks/páginas
do módulo Tratamentos, criando o guard de rota `RequireInstituicao` e aplicando
filtros explícitos por `instituicao_id` nas consultas diretas às 13 tabelas T-DIR
base (SAAS-05-B), **sem** alterar RPCs, edge functions, schema, RLS, policies ou
regras de negócio.

Este recorte prepara a camada de apresentação para operar em multi-tenant.
O enforcement definitivo em backend fica para SAAS-05-E (RPCs) e SAAS-05-F
(cutover RLS + `NOT NULL`).

---

## 2. Entregas

### 2.1. `RequireInstituicao` (novo componente)

Arquivo: `src/components/RequireInstituicao.tsx`

- Consome `InstituicaoContext` (fonte única).
- Fail-closed: sem `selecionada` → `<Navigate to={ROUTES.portal} replace>`.
- Enquanto o hub carrega, exibe spinner controlado.
- Não recebe `instituicaoId` por props — impede que chamador burle o contexto.
- Não lê `localStorage`.

### 2.2. Helper módulo-nível `currentTenant`

Arquivo: `src/lib/tenant/currentTenant.ts`

Espelho controlado do tenant ativo, sincronizado exclusivamente pelo
`InstituicaoProvider` via `_setCurrentInstituicaoId`. Permite que services
executados fora da árvore React (ou dentro dela sem acesso ao context) falhem
fechado sem duplicar leitura de `localStorage`.

API:

| Função | Semântica |
| --- | --- |
| `requireInstituicaoId(explicit?)` | Fail-closed: `throw` se não houver tenant. Aceita id explícito (testes/server-side). |
| `getCurrentInstituicaoId()` | Retorna `string \| null` sem lançar (usado em code paths que rodam antes do guard, ex.: theme loader). |
| `withInstituicao(cb)` | Açúcar: executa `cb(instituicaoId)` com fail-closed. |
| `_setCurrentInstituicaoId(id)` | **Uso interno**: apenas o `InstituicaoProvider` chama. |

Regras invioláveis (validadas em teste):

- Não lê `localStorage` / `sessionStorage` / `window`.
- Não aceita id fora do contexto (o provider é quem valida `allowedIds`).
- `InstituicaoProvider` sincroniza no mount/update e **limpa no unmount**.

### 2.3. Guard aplicado nas rotas operacionais

Em `src/App.tsx` foi introduzido o wrapper local `tenant(node)` que envolve o
element de cada `<Route>` com `<RequireInstituicao>`.

**Rotas protegidas por tenant** (T-DIR / operacionais):

`dashboard`, `usuarios`, `solicitacoesCadastro`, `governancaAcessos`,
`escopoOperacional`, `tratamentos`, `assistidos`, `consultaAssistido`,
`migrarAssistido`, `homologacaoAgenda`, `entrevistas`, `fazerEntrevista`,
`agenda`, `avisosAusencia`, `presenca`, `centralNotificacoes`,
`observabilidade`, `listaEspera`, `coordenadorTratamentos`,
`coordenadorAgenda`, `relatorios`, `configuracoes`, `gestaoCores`, `auditoria`,
`regras`, `governancaParametros`, `excecoes`, `excecoesOperacionais`,
`programacaoPadrao`, `instituicao`, `centralIa`, `voluntarios`,
`funcoesVoluntariado`, `sessoesPublicas`, `acaoSocial`, `campanhas`, `eventos`,
`comunicacaoInstitucional`, `painelInstitucional`.

**Rotas globais (NÃO exigem tenant ativo):**

- Identidade/auth: `login`, `forgotPassword`, `resetPassword`, `mfaVerify`,
  `segurancaConta`, `segurancaPrivacidade`.
- Perfil global do assistido: `meuPerfil`, `meusDocumentos`, `meusTratamentos`,
  `minhaAgenda` (fluxo pessoal — assistido pertence a uma única instituição no
  modelo atual; adaptação futura fica no SAAS-05-E se necessário).
- Portal / Hub SaaS: `portal`, `portalInstituicoes`, `portalModulos`,
  `portalAdmin` (permitem *selecionar* a instituição — não podem exigi-la).
- Público: `checkinPublico` (resolve tenant pelo código da sessão).
- Comunicação/ajuda: `notificacoes`, `ajuda`.

### 2.4. Services/hooks T-DIR adaptados

Todos aplicam `requireInstituicaoId()` (fail-closed) e `.eq('instituicao_id', id)`
em selects/updates/deletes. Inserts recebem `instituicao_id` injetado.

| Arquivo | Tabelas T-DIR alcançadas | Ações adaptadas |
| --- | --- | --- |
| `src/services/voluntarios/voluntariosService.ts` | `voluntarios` | select, insert, update, dedup CPF |
| `src/services/voluntarios.ts` | `voluntarios` | select, insert, update, dedup CPF |
| `src/services/sessoesPublicas.ts` | `sessoes_publicas` | select por data, insert |
| `src/services/programacao/programacaoPadraoService.ts` | `programacao_padrao` | list/insert/update/toggle/delete |
| `src/services/programacao/excecoesService.ts` | `excecoes_operacionais` + `regras_operacionais` | list/insert/update/toggle/delete + rollout ON/OFF |
| `src/hooks/useAvisos.ts` | `avisos_internos` | select + realtime filter |
| `src/hooks/useThemeColors.ts` | `configuracoes_gerais` | select `cor_%` |

### 2.5. Sincronização Context ↔ módulo

`src/contexts/InstituicaoContext.tsx` chama `_setCurrentInstituicaoId(selecionada?.id ?? null)`
em `useEffect` e limpa no cleanup. Isso mantém `InstituicaoContext` como fonte única.

---

## 3. Pendências deliberadas para o SAAS-05-E

Não foram tocadas neste recorte porque dependem de adaptação de RPCs
(`p_instituicao_id`) ou de edge functions, o que está fora do escopo do 05-D.

### 3.1. RPCs/functions pendentes

| Chamada | Página/service | Motivo |
| --- | --- | --- |
| `fn_processar_excecao_notificacoes(p_excecao_id)` | `excecoesService.ts` | Já roda com a exceção correta gravada (que já é tenant-scoped); adicionar `p_instituicao_id` fica no 05-E para defesa em profundidade. |
| `fn_monitor_excecao_notificacoes(p_desde)` | `excecoesService.ts` | Monitor de rollout global; escopar por tenant no 05-E. |
| `gerenciar_voluntario(p_action, p_voluntario_id, ...)` | `voluntariosService.ts` | RPC atua sobre id específico — o backend valida ownership. Adicionar guard adicional no 05-E. |
| `gerenciar_termo_voluntario(...)` | `voluntariosService.ts` | Idem. |
| `fn_buscar_pessoa_para_voluntario(p_termo)` | `voluntariosService.ts` | Busca cross-schema (assistidos + usuários); adaptação no 05-E. |
| Todas as RPCs consumidas por `Assistidos.tsx`, `Agenda.tsx`, `Entrevistas.tsx`, `Presenca.tsx`, `Tratamentos.tsx`, `CoordenadorAgenda.tsx`, `Relatorios.tsx`, `CentralIA.tsx`, `CentralNotificacoes.tsx`, `Observabilidade.tsx`, `AcaoSocial.tsx`, `Campanhas.tsx`, `Eventos.tsx`, `ComunicacaoInstitucional.tsx`, `PainelInstitucional.tsx` | várias | Manter comportamento atual (guardado pela RLS legada). Adaptação em bloco no 05-E. |

### 3.2. Consultas diretas T-DIR não adaptadas neste recorte

As tabelas abaixo têm `instituicao_id` estrutural (SAAS-05-B) mas o frontend
não faz `.from(t).select(...)` direto — o acesso passa por RPCs.
Serão totalmente cobertas no SAAS-05-E via adaptação das RPCs correspondentes:

- `assistidos` (usado em ~20 arquivos, quase todos via RPC/consolidação)
- `palestras`
- `campanhas`
- `eventos`
- `acao_social_alimentos`
- `comunicacoes_institucionais`

### 3.3. Theme loader fora do provider

`useThemeColors` roda no root do App (fora do `InstituicaoProvider`). Usa o
espelho módulo-nível para pular fetch quando ainda não há tenant. **Limitação
conhecida:** não recarrega automaticamente ao trocar de instituição — o usuário
precisa recarregar a página. Correção prevista para SAAS-05-E: mover o
`ThemeLoader` para dentro do `AppLayout`/`InstituicaoProvider` e reagir a
mudança de `selecionada?.id`.

---

## 4. Decisão de arquitetura: GUC/JWT NÃO implementado

Este recorte **não** implementa `SET LOCAL app.current_instituicao`, JWT custom
claim, alteração de `auth.user_metadata`, pre-request hook do PostgREST nem
headers especiais. Alternativas técnicas ficam registradas como opções para o
SAAS-05-E, com trade-offs:

| Opção | Prós | Contras |
| --- | --- | --- |
| `SET LOCAL app.current_instituicao` via RPC wrapper | Reaproveita helpers shadow do 05-C (`current_instituicao_id()`). | Exige wrapper por chamada; frontend precisa injetar sempre; risco de esquecer. |
| JWT custom claim (via auth hook) | Backend lê do JWT nativamente; imune a spoofing do cliente. | Requer troca de token ao trocar tenant; UX de switch fica async; toca fluxo de auth. |
| Header customizado + pre-request hook | Sem re-login; funciona com PostgREST. | Depende de hook `SECURITY DEFINER` bem escrito; risco de bypass se hook falhar aberto. |

Recomendação para SAAS-05-E: **wrapper RPC + `SET LOCAL`** para o cutover 05-F,
mantendo o filtro `.eq('instituicao_id', ...)` no frontend como camada
adicional (defesa em profundidade).

---

## 5. Riscos remanescentes

| Risco | Mitigação atual | Mitigação futura |
| --- | --- | --- |
| Frontend com filtro correto, backend ainda permissivo (shadow) | RLS legada em vigor; policies shadow são PERMISSIVE (não restringem). | SAAS-05-F: cutover RLS + `NOT NULL`. |
| RPC retorna dados de outro tenant | RLS legada + validação por id específico. | SAAS-05-E: `p_instituicao_id` obrigatório + `has_role_in_instituicao`. |
| Usuário manipula `localStorage` para tentar mudar tenant | `useSelectedInstituicao` descarta id fora de `allowedIds`; provider revalida via hub. | Sem mudança necessária — SAAS-04 já fecha. |
| Theme não reage à troca de tenant | Reload manual. | SAAS-05-E: mover `ThemeLoader` para dentro do `AppLayout`. |
| Rota operacional nova esquece `tenant(...)` | Contrato de teste `saas05d-*.test.ts` valida rotas conhecidas. | Adicionar linter/rota-registry se surgirem regressões. |

---

## 6. Escopo preservado (checklist)

- [x] Nenhuma migration nova.
- [x] Nenhuma alteração de RLS ou policy.
- [x] Nenhuma alteração de RPC ou function funcional.
- [x] Nenhuma alteração de edge function.
- [x] Nenhuma alteração de `SECURITY DEFINER`.
- [x] Nenhum `NOT NULL` aplicado em `instituicao_id`.
- [x] Nenhuma alteração em `notificações`, `dispatcher`, `provider`, check-in
      público, templates, ou dados reais.
- [x] Projeto FER original inalterado.
- [x] SAAS-02-S3 não iniciado.
- [x] Tabelas T-HER / G-PAR / G-GLB / A-ANA intocadas.
- [x] GUC/JWT não implementados (apenas documentados como opção 05-E).

---

## 7. Testes

- Contrato: `src/test/governanca/saas05d-propagacao-tenant-frontend.test.ts`
  (helper, provider sync, guard, rotas protegidas vs. globais, filtro
  `.eq('instituicao_id', ...)` nos 7 services adaptados, ausência de
  `localStorage` no `currentTenant`, ausência de alteração em assinatura de
  RPCs, cobertura da matriz T-DIR).

---

## 8. Indicadores

| Indicador | Baseline SAAS-05-C | Pós SAAS-05-D |
| --- | --- | --- |
| 0028 | 143 | 143 |
| 0025 | 0 | 0 |
| 0029 | 56 | 56 |

Sem alteração — nenhuma nova função `SECURITY DEFINER` foi criada e nenhum
helper foi promovido a policy funcional (as policies do 05-C permanecem em
modo shadow permissivo).
