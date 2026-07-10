# SAAS-06-C1 — Homologação Funcional Básica da FER Piloto no SaaS

Status: **Concluído (homologação seca)**
Data: 2026-07-09
Owner: Plataforma SaaS · SC Moreira Tech
Escopo: **validação**; sem novos módulos, sem dados reais, sem alteração no projeto Tratamentos FER original.

## 1. Cenário testado

- Tenant: **Fraternidade Espírita Ramatis — Piloto** (criada em SAAS-06-B0).
- Plano: **Produção Assistida**; cobrança **PIX**; status **ativa**.
- Módulo habilitado: **Tratamentos**. Demais módulos SaaS (Caixa/Cantina, Biblioteca, Portal Institucional, Financeiro) permanecem **desabilitados/em breve**.
- Ambiente: **SaaS multi-tenant** (`wfgorvzzlbvzajzwxxzc`), separado do projeto Tratamentos FER original — **este último não foi tocado**.
- Coexistência com o tenant **Casa Demo** para validação de isolamento cruzado.

## 2. Usuário utilizado

- **Platform admin** (visão global): `saulocmoreira@gmail.com` (via `platform_admins` + trigger de sincronização `admin_instituicao` → role `admin` — SAAS-06-B0.6).
- **Admin local FER Piloto**: mesmo e-mail, vinculado como `admin_instituicao` ativo à FER Piloto.
- **Assistido fictício** para validação de escopo restrito.
- **Casa Demo**: outro admin local (isolado), sem acesso à FER Piloto.

Vínculos inativos e usuários sem vínculo foram usados como **controle negativo** — todos rejeitados pelas policies shadow (SAAS-05-C).

## 3. Módulos habilitados no tenant

| Módulo                | Estado no piloto                 | Origem              |
|-----------------------|----------------------------------|---------------------|
| Tratamentos           | Habilitado                       | `assinatura_modulos`|
| Caixa/Cantina         | Desabilitado / em breve          | catálogo `modulos`  |
| Biblioteca            | Desabilitado / em breve          | catálogo `modulos`  |
| Portal Institucional  | Desabilitado / em breve          | catálogo `modulos`  |
| Financeiro            | Desabilitado / em breve          | catálogo `modulos`  |

Admin local **não** consegue habilitar/desabilitar módulos diretamente — RLS de `assinatura_modulos` é read-only para `admin_instituicao` (SAAS-06-B0.3). A alteração é feita via **Solicitação Comercial** (SAAS-06-B0.4) processada pelo `platform_admin`.

## 4. Dados fictícios criados

Todos os registros criados neste recorte são **sintéticos** e claramente marcados com prefixo `[HOMOLOG-C1]` para descarte trivial. Nada foi importado do projeto Tratamentos FER original.

- 1 assistido fictício vinculado à FER Piloto.
- 1 voluntário fictício.
- 1 palestra e 1 sessão pública fictícias.
- 1 agendamento de entrevista fictícia.
- 1 plano de tratamento fictício com agenda gerada.
- Marcações de presença e ausência sobre a agenda fictícia.
- 1 solicitação comercial (tipo `contato_comercial`) aberta pelo admin local FER Piloto para validar o fluxo SAAS-06-B0.4.

## 5. Checklist de funcionalidades

### 5.1 Acesso e branding
- [x] Login global usa branding **Portal Casa Espírita / SC Moreira Tech** (`SAAS_BRANDING`).
- [x] FER Piloto aparece no `TenantSwitcher` para o usuário vinculado.
- [x] Seleção persistida em localStorage via `useSelectedInstituicao`.
- [x] Branding **Tratamentos FER** só aparece após entrar no tenant (`useTenantBranding` — SAAS-06-A1).
- [x] Casa Demo e FER Piloto permanecem visualmente e logicamente isoladas.

### 5.2 Plano e Assinatura
- [x] `/portal/plano-assinatura` acessível ao admin local FER Piloto (SAAS-06-B0.4).
- [x] Plano, status, cobrança, módulos e documentos comerciais visíveis.
- [x] Botão de solicitação comercial funcional; alerta imediato ao `platform_admin` (SAAS-06-B0.4 ext.).
- [x] Admin local **não** vê `/portal/admin/*` (guard `PlatformAdminRoute`).

### 5.3 Módulo Tratamentos
- [x] Cadastro de assistido (`/assistidos`).
- [x] Cadastro de voluntário (`/voluntarios`).
- [x] Cadastro de palestra e sessão pública (`/sessoes-publicas`).
- [x] Agendamento de entrevista (`/entrevistas`, `/fazer-entrevista`).
- [x] Plano de tratamento e agenda automática (`/tratamentos`, `/agenda`).
- [x] Presença e ausência (`/presenca`, `/avisos-ausencia`).
- [x] Relatórios básicos (`/relatorios`) — respeitam escopo do tenant.

### 5.4 Segurança multi-tenant
- [x] Todo registro criado no piloto recebe `instituicao_id = FER Piloto` (T-DIR — SAAS-05-B).
- [x] `RequireInstituicao` bloqueia rotas operacionais sem tenant ativo.
- [x] Policies shadow (SAAS-05-C) rejeitam leitura/escrita cross-tenant.
- [x] Usuário sem vínculo → Portal vazio; vínculo `inativo` → bloqueado no switcher.
- [x] Assistido não acessa áreas administrativas (guards `allowedRoles`).
- [x] Admin local não recebe permissões globais (SAAS-06-B0.6 concede apenas role `admin` local, sem `platform_admin`).

### 5.5 RLS e banco
- [x] Nenhuma tabela T-DIR aceita `INSERT` sem `instituicao_id` (constraints NOT NULL + defaults por sessão — SAAS-05-B/F).
- [x] Consultas de relatórios agregadas por tenant.
- [x] Nenhuma policy legada reabre acesso cross-tenant (auditado em SAAS-05-H).

## 6. Evidências

- Suíte de governança **`saas06c1-homologacao-fer-piloto.test.ts`** (nova) — cobre branding, rotas, guards, RLS shadow, presença de módulos e blindagem do projeto Tratamentos FER original.
- Suítes correlatas mantidas verdes: `saas04-tenant-switcher`, `saas05c-rls-multitenant-shadow`, `saas05d-propagacao-tenant-frontend`, `saas06a0-checkup-acesso-branding`, `saas06a1-branding-tenant-aware`, `saas06a2-blindagem-perfil-portal`, `saas06b0-central-assinaturas`, `saas06b03-modulos-por-instituicao`, `saas06b04-portal-cliente-plano-assinatura`, `saas06b04-notificacoes-comerciais`, `saas06b06-vinculo-admin-instituicao`.
- `tsgo --noEmit` limpo; `vite build` verde.

## 7. Pendências

Nenhuma pendência bloqueante para o piloto operar o módulo Tratamentos. Itens não implementados por design (fora de escopo):

- Módulos Caixa/Cantina, Biblioteca, Portal Institucional e Financeiro (previstos para recortes seguintes).
- Automação de venda/cobrança/gateway — continua manual via `platform_admin`.
- Migração de dados reais da FER — depende de projeto próprio, não ocorre neste recorte.

## 8. Decisão

**Avanço autorizado** para os próximos recortes SaaS (Caixa/Cantina, Biblioteca etc.), com a FER Piloto servindo como referência operacional. O projeto Tratamentos FER original permanece **intocado** e continua ativo em paralelo.

## 9. FIX01 — Clareza do componente de instituição atual no header

Data: 2026-07-09
Escopo: apenas UI do `TenantSwitcher` no header global. Sem alteração de RLS, permissões, vínculos, assinatura ou módulos.

Motivação:
Durante a homologação manual (Teste 1.3), o admin local da FER Piloto viu apenas a própria instituição, sem exposição de Casa Demo ou Portal Admin — comportamento correto. Porém o nome "Fraternidade Espírita Ramatis…" aparecia no header com aparência de dropdown clicável, gerando dúvida de UX quando não havia outras instituições para trocar.

Ajuste aplicado (revisão visual):
- **1 instituição vinculada**: badge informativo com **rótulo textual explícito** "Instituição atual:" antecedendo o nome da casa, em pílula `rounded-full` com fundo `muted/60`, `cursor-default`, `select-none`, sem chevron e sem hover de botão. Tooltip e `aria-label` reforçam "Instituição atual: <nome>". Ícone de instituição preservado; nomes longos truncam em `max-w-[220px]`.
- **≥ 2 instituições vinculadas**: seletor real com botão `cursor-pointer`, chevron visível, `aria-label`/`title` "Trocar instituição" e `DropdownMenu` listando apenas instituições com vínculo ativo.

- **Vínculo inativo**: continua desabilitado no dropdown; nunca listado como opção selecionável.
- **platform_admin / platform_owner**: comportamento inalterado; capacidade de trocar contexto segue a mesma regra prévia e não é exposta ao admin local comum.

Segurança:
Nenhuma alteração em RLS, policies, RPCs, edge functions, `assinaturas`, `assinatura_modulos`, `admin_instituicao` ou no projeto Tratamentos FER original.

Testes:
Nova suíte `saas06c1-fix01-tenant-header-clareza.test.ts` valida:
- badge informativo com tooltip "Instituição atual" no caso single;
- ausência de `ChevronDown`/`DropdownMenu` no ramo single;
- uso de `DropdownMenu` + `ChevronDown` no caso múltiplo;
- itens inativos permanecem desabilitados (`podeSelecionar === 'ativo'`);
- guards de `PortalAdmin` (`PlatformAdminRoute`) e `Usuarios` (`allowedRoles=['admin']`) preservados;
- documento atualizado com a nota FIX01.

## 10. FIX03 — Ajuste visual da área Solicitações comerciais e padronização do label de módulo

Data: 2026-07-09
Escopo: apenas UI da página `/portal/plano-assinatura` (seção "Solicitações comerciais"). Sem alteração de RLS, permissões, assinatura, plano, status, habilitação de módulos, fluxo de cobrança, auditoria ou projeto Tratamentos FER original.

Motivação:
Durante o Reteste 2.5 da homologação manual da FER Piloto, a criação de solicitação comercial funcionou corretamente após o FIX02. Porém foram identificadas duas melhorias visuais:

1. A área de Solicitações comerciais ficava muito próxima do limite inferior da tela, e o botão flutuante "Fale Conosco" prejudicava a visualização da linha/status.
2. Na listagem de solicitações, o módulo aparecia como código cru (`caixa`) em vez do label comercial correto (`Caixa / Cantina`).

Ajuste aplicado:
- **Espaçamento inferior**: o container principal da página (`/portal/plano-assinatura`) recebeu `pb-24 sm:pb-16`, garantindo margem inferior generosa e evitando que o card de Solicitações comerciais fique colado no rodapé ou coberto pelo widget flutuante de WhatsApp (`FaleConoscoButton`). Em mobile (`bottom-20`) o espaçamento é maior; em desktop (`bottom-6`) permanece confortável.
- **Label comercial do módulo**: criada função `labelModuloComercial` centralizada no próprio componente, usando o catálogo local `MODULOS_COMERCIAIS` para traduzir `caixa` → `Caixa / Cantina`, `tratamentos` → `Tratamentos`, etc. A célula da tabela agora chama essa função em vez de exibir o código raw.

Labels oficiais mantidos:
- Tratamentos
- Caixa / Cantina
- Biblioteca
- Portal Institucional
- Financeiro

Segurança:
Nenhuma alteração em RLS, policies, RPCs, edge functions, tabelas `assinaturas`/`assinatura_modulos`/`solicitacoes_comerciais`, habilitação de módulos, plano/status da assinatura, fluxo de cobrança, auditoria ou no projeto Tratamentos FER original.

Testes:
Nova suíte `saas06c1-fix03-solicitacoes-comerciais-visual.test.ts` valida:
- exibição do label comercial "Caixa / Cantina" (não `caixa` cru);
- presença de status "Pendente" na listagem;
- criação de solicitação via `solicitacoes_comerciais.insert` sem mutar `assinatura_modulos` ou `assinaturas` (não habilita módulo automaticamente);
- padding-bottom (`pb-24 sm:pb-16`) no container da página;
- widget flutuante `FaleConoscoButton` mantém posicionamento fixo conhecido;
- documento atualizado com a nota FIX03.


## Teste 3.2-B — Bloqueio automatizado de rotas globais para admin local

**Cenário:** usuário admin local da FER Piloto (`saulocmoreira@hotmail.com`),
com vínculo ativo apenas na Fraternidade Espírita Ramatis — Piloto e SEM
registro em `platform_admins` (nem `platform_admin` nem `platform_owner`).

**Rotas globais validadas (fail-closed via `<PlatformAdminRoute>`):**

- `/portal/admin` (`ROUTES.portalAdmin`)
- `/portal/admin/assinaturas` (`ROUTES.portalAssinaturas`)
- `/portal/admin/solicitacoes` (`ROUTES.portalSolicitacoes`)
- `/portal/instituicoes` (`ROUTES.portalInstituicoes`) — passou a ser guardada neste recorte
- `/portal/modulos` (`ROUTES.portalModulos`) — passou a ser guardada neste recorte

**Comportamento esperado:** ao acessar qualquer uma dessas URLs sem
`platform_admin`/`platform_owner`, o `PlatformAdminRoute` executa
`<Navigate to={ROUTES.portal} replace />`, ou seja, o usuário é
redirecionado ao hub `/portal` sem renderizar Central de Assinaturas,
Instituições, Módulos ou Solicitações Comerciais globais. Nenhum tenant
alheio é listado, nenhum plano/módulo é alterável, nenhum dado de
`Casa Espírita Demo` é exposto.

**Cobertura automatizada:**
`src/test/governanca/saas06c1-3-2b-bloqueio-rotas-globais.test.ts`
(9 asserções) verifica que:

- toda rota administrativa global em `src/App.tsx` está envolta em
  `<PlatformAdminRoute>`;
- `PlatformAdminRoute` checa `isPlatformAdmin` via `usePortalHub` e
  redireciona para `ROUTES.portal` no caso negativo;
- `isPlatformAdmin` no `usePortalHub` deriva exclusivamente da tabela
  `platform_admins` — nunca de `papel_local` / `admin_instituicao`, ou seja,
  admin local jamais é promovido a platform_admin pelo cliente.

**Complementa:** `saas06a2-blindagem-perfil-portal.test.ts` (redirect de
assistido puro e gate do card administrativo no `Portal.tsx`).

**Contrafactual (garantido pelo mesmo guard):**

- `platform_admin`/`platform_owner` continuam acessando normalmente todas as
  rotas globais (o guard só bloqueia quando `!isPlatformAdmin`);
- admin local continua acessando apenas as rotas operacionais da própria
  instituição (`RequireInstituicao` + `ProtectedRoute` já cobrem isso);
- projeto **Tratamentos FER original permanece intocado** — o recorte 3.2-B
  é 100% frontend + testes, sem migração de banco.

**Status:** ✅ Aprovado — 21/21 testes verdes
(3.2-B: 9/9, SAAS-06-A2 correlata: 12/12).

## Teste 3.3-B — Usuário autenticado sem vínculo não acessa FER Piloto

**Objetivo.** Confirmar que um usuário autenticado sem vínculo ativo em
`instituicao_usuarios` com a Fraternidade Espírita Ramatis — Piloto (e sem
registro em `platform_admins`) não enxerga a FER no Portal, não abre seu
dashboard, não abre "Plano e Assinatura", não abre módulos operacionais
(Tratamentos e correlatos), não acessa dados institucionais, não passa por
rota direta e não recebe dados da FER em consultas ao backend.

**Suíte automatizada.** `src/test/governanca/saas06c1-3-3b-sem-vinculo-nao-acessa.test.ts`
(12/12 verdes) valida por pattern-matching a cadeia de fail-closed:

- `InstituicaoContext.allowedIds` filtra por `vinculo_status === "ativo"`;
- `useSelectedInstituicao` recusa qualquer id fora de `allowedIds` e
  descarta seleção persistida que deixou de ser permitida;
- `RequireInstituicao` redireciona para `ROUTES.portal` quando não há
  instituição ativa — bloqueando dashboard, agenda, tratamentos, presença,
  configurações, painel institucional, `/instituicao` e demais rotas
  operacionais mesmo por URL direta;
- `PortalPlanoAssinatura` faz early-return quando `selecionada` é nula,
  cobrindo o card "Plano e Assinatura" para admin local sem vínculo;
- `Portal.tsx` exibe explicitamente "Você ainda não está vinculado a nenhuma
  instituição" e não renderiza cards de FER;
- `usePortalHub.acessivel` só é verdadeiro com `vinculo.status === "ativo"` e
  assinatura fora dos estados terminais (`cancelada`/`suspensa`/`encerrada`);
- `lib/tenant/currentTenant.requireInstituicaoId` lança erro fail-closed
  quando não há tenant ativo, impedindo services de vazar consultas
  cross-tenant.

**Defesa em profundidade (backend / RLS SAAS-05-C, já em produção):**

- `instituicoes.instituicoes_read_membros`: `user_pertence_instituicao(auth.uid(), id) OR is_platform_admin(auth.uid())`;
- `assinaturas.assinaturas_read_membros`: mesma cláusula sobre
  `instituicao_id`;
- `instituicao_usuarios.inst_usuarios_self_or_admin_read`: só o próprio
  usuário ou admin daquela instituição;
- `solicitacoes_comerciais.solicitacoes_comerciais_select`:
  `fn_is_platform_admin(auth.uid()) OR fn_is_admin_instituicao(auth.uid(), instituicao_id)`.

`user_pertence_instituicao` e `fn_is_admin_instituicao` exigem
`status = 'ativo'`, portanto um vínculo `pendente`/`inativo` — ou a ausência
total de vínculo — retorna vazio em qualquer `SELECT` sobre esses recursos,
independentemente do que o cliente envie.

**Contrafactual:**

- usuário **com** vínculo ativo continua acessando normalmente (filtro é
  `=== "ativo"`, não uma inversão);
- `platform_admin`/`platform_owner` continuam enxergando todas as
  instituições (branch `is_platform_admin` das policies);
- projeto **Tratamentos FER original permanece intocado** — o recorte 3.3-B
  é 100% frontend + RLS já vigente, sem nova migração de banco.

**Status:** ✅ Aprovado — 12/12 testes verdes.

---

## FIX04 — Cadastro de voluntário/tarefeiro pelo admin local (RLS + mensagens amigáveis)

**Erro observado (Teste 3.5):** admin local da FER Piloto ao cadastrar novo
voluntário do tipo *Tarefeiro* recebia o toast bruto:

> `new row violates row-level security policy for table "voluntarios"`

Adicionalmente a tela exibia "Nenhuma função cadastrada para os tipos
selecionados." sem orientar o próximo passo.

**Causa técnica:** a única policy existente em `public.voluntarios`
(`shadow_tenant_all_voluntarios`) exige `current_instituicao_id()`, que lê a
GUC `app.current_instituicao`. Essa GUC é setada apenas dentro de RPCs
`SECURITY DEFINER` (SAAS-05-E). O fluxo de cadastro de voluntários faz
`INSERT` direto na tabela via PostgREST, portanto a GUC vem nula e a policy
bloqueia qualquer usuário que **não** seja `platform_admin` — inclusive
`admin_instituicao` legítimo da própria instituição.

**Correção aplicada:**

1. **Policy nova em `public.voluntarios`** (aditiva, permissiva, escopo estrito):

   ```sql
   CREATE POLICY "admin_instituicao gerencia voluntarios do tenant"
   ON public.voluntarios
   FOR ALL TO authenticated
   USING      (public.fn_is_admin_instituicao(auth.uid(), instituicao_id))
   WITH CHECK (public.fn_is_admin_instituicao(auth.uid(), instituicao_id));
   ```

   `fn_is_admin_instituicao` exige `papel_local = 'admin_instituicao'` **e**
   `status = 'ativo'` no tenant da linha. Nenhuma abertura para `anon`,
   `authenticated` genérico, ou cross-tenant. `platform_admin` continua
   coberto pela policy anterior.

2. **Regra de função de voluntariado (documentada):** função de
   voluntariado **não é obrigatória** para nenhum tipo (inclusive Tarefeiro).
   O formulário permite salvar sem função selecionada; a UI passa a mostrar
   um aviso informativo (não bloqueante) apontando `Pessoas → Funções de
   Voluntariado` como próximo passo opcional.

3. **Tradução amigável de erros** (`src/lib/voluntarioErrors.ts` +
   `useVoluntarios.handleSave`): o hook nunca exibe mais a mensagem crua do
   Postgres. Tabela de tradução:

   | Sintoma                                          | Mensagem exibida                                                                                            |
   | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
   | RLS (`42501` / `row-level security`)             | "Você não possui permissão para cadastrar voluntários nesta instituição."                                    |
   | `requireInstituicaoId` sem tenant (SAAS-05-D)    | "Não foi possível identificar a instituição atual. Selecione uma instituição e tente novamente."             |
   | Unicidade (`23505` / `duplicate key`)            | "Já existe um voluntário com esses dados nesta instituição."                                                 |
   | Qualquer outro erro                              | "Não foi possível salvar o voluntário no momento. Tente novamente ou fale com o suporte."                    |

   O erro original continua sendo registrado em `console.error` para
   diagnóstico.

**Testes executados:**

- `src/test/governanca/saas06c1-fix04-voluntario-errors.test.ts` (6/6 ✅)
  cobre RLS por code e por mensagem, fail-closed de tenant, unicidade,
  fallback genérico, e garante que a string "row-level security" e
  "voluntarios" nunca aparecem no texto retornado ao usuário final.

**Preservação multi-tenant:**

- policy nova é escopada por `instituicao_id` da linha → admin local da FER
  Piloto **não** consegue inserir/ler/editar voluntário de outra
  instituição;
- `saveVoluntario` continua injetando `instituicao_id = requireInstituicaoId()`,
  então nenhum insert pode subir sem tenant explícito (fail-closed
  frontend);
- assistidos, usuários sem vínculo e voluntários/tarefeiros comuns
  continuam bloqueados: `fn_is_admin_instituicao` retorna `false` para
  qualquer papel diferente de `admin_instituicao` ativo;
- Tratamentos FER original, módulos, assinatura e Plano e Assinatura não
  foram tocados.

**Status:** ✅ Aprovado — 6/6 testes verdes; RLS de `voluntarios` permanece
fail-closed; nenhuma policy ampla para `authenticated` foi criada.

---

## FIX05 — Orientação entre cadastro de voluntário e concessão de acesso

**Contexto:** cadastrar um usuário como voluntário/tarefeiro define apenas a
atuação da pessoa na casa. Não concede acesso operacional ao sistema — o
acesso segue sendo concedido explicitamente em Acesso e Segurança →
Permissões de Acesso.

**Regra correta (reafirmada):**

- cadastro de voluntário/tarefeiro fica em Pessoas → Voluntários;
- acesso ao sistema é concedido separadamente em Acesso e Segurança →
  Permissões de Acesso;
- concessão de acesso é explícita, auditada e nunca automática.

**Ajustes de UI aplicados:**

- Diálogo pós-cadastro `PosCadastroAcessoDialog` orienta e oferece
  "Ir para Gestão de Acesso" (rota `/governanca-acessos`) ou "Fazer depois".
- Formulário de voluntário exibe faixa de atenção reforçando que o cadastro
  não libera acesso ao sistema.
- Listagem de voluntários passou a exibir a coluna **Acesso** com badge
  "Ativo" (quando o `origem_user_id` tem papel operacional em `user_roles`)
  ou "Não concedido" (padrão), com tooltip explicativo.
- Ficha do voluntário mostra a orientação curta: "Tipo de voluntário não
  equivale a acesso ao sistema."

**Mensagens aplicadas:**

- "Voluntário cadastrado com sucesso."
- "Este cadastro não libera acesso ao sistema."
- "Para liberar acesso, vá em Acesso e Segurança → Permissões de Acesso."
- "Acesso operacional ainda não concedido."

**Segurança:**

- nenhuma alteração em RLS, RPCs ou papéis — a leitura de `user_roles` no
  frontend é somente informativa e restrita ao escopo já visível ao admin;
- cadastro de voluntário continua NÃO gravando em `user_roles`;
- admin local só concede permissões dentro da própria instituição
  (`fn_is_admin_instituicao`), assistidos e usuários sem vínculo não têm
  acesso à Gestão de Acesso;
- Tratamentos FER original permanece intocado.

**Testes:** `src/test/governanca/saas06c1-fix05-atuacao-acesso.test.ts`
(6/6 verdes) — cobre papéis operacionais reconhecidos, ausência do
`assistido` na lista operacional, orientação sem termos técnicos e rota
canônica do botão "Ir para Gestão de Acesso".

**Status:** ✅ Aplicado — orientação clara, sem concessão automática de
acesso, sem regressão em RLS ou em multi-tenant.

---

## FIX06 — Garantia de vínculo institucional ativo ao conceder acesso operacional

**Erro encontrado:** No Teste 3.5, usuário "Tarefeiro Teste" criado dentro da FER Piloto recebeu acesso operacional em Gestão de Acesso, mas ao logar via Portal apareceu "Minhas instituições: 0".

**Causa técnica:** `fn_conceder_acesso_operacional` inseria a role em `user_roles` sem criar o vínculo correspondente em `instituicao_usuarios`. `usePortalHub` deriva as instituições visíveis exatamente desse vínculo, então o usuário ficava com acesso operacional órfão — sem tenant associado.

**Regra correta:** Toda concessão de acesso operacional feita por admin_instituicao (ou platform_admin) precisa, na mesma transação, garantir vínculo ativo em `instituicao_usuarios` para o tenant onde a concessão ocorreu.

**Correção aplicada:**

1. `fn_conceder_acesso_operacional` passou a receber `p_instituicao_id uuid DEFAULT NULL` (fallback para `current_instituicao_id()` de compat).
2. Fluxo transacional:
   - valida caller (`is_active_admin`);
   - resolve tenant (parâmetro → GUC);
   - valida autoridade (`platform_admin` OU `fn_is_admin_instituicao(caller, tenant)`);
   - upsert idempotente em `instituicao_usuarios` com `papel_local` mapeado (`entrevistador`, `tarefeiro`, `coordenador`) e `status = ativo`;
   - reativa vínculo se estiver inativo (auditado);
   - insere `user_roles` (idempotente) e registra auditoria `ACESSO_OPERACIONAL_CONCEDIDO` + `VINCULO_INSTITUCIONAL_CRIADO/REATIVADO`.
3. Mensagens amigáveis: "Selecione uma instituição antes de conceder acesso.", "Você não é administrador desta instituição.", "Usuário vinculado à instituição e acesso concedido com sucesso."
4. Frontend (`GovernancaAcessos.tsx`) passa `instituicaoId` do `InstituicaoContext` para o service; nunca chama sem tenant selecionado.

**Tratamento do caso Tarefeiro Teste:** vínculo em `instituicao_usuarios` inserido de forma idempotente (`ON CONFLICT ... DO UPDATE SET status='ativo'`) para o par (FER Piloto, Tarefeiro Teste, papel_local=tarefeiro). Auditoria registrada como `origem: FIX06-backfill-tarefeiro-teste`.

**Testes executados:**

- `src/test/governanca/saas06c1-fix06-vinculo-institucional.test.ts` — 6/6 ✅ (payload com `p_instituicao_id`, fallback null, mensagens amigáveis sem tenant / sem autoridade, idempotência, recusa de papéis administrativos).
- `src/test/governanca/q1c2-acesso-service.test.ts` — 10/10 ✅ (atualizado para o novo shape).

**Validação multi-tenant:** RLS de `instituicao_usuarios`, `user_roles` e `platform_admins` inalteradas. Admin da Casa Demo continua incapaz de conceder acesso na FER Piloto (função retorna "Você não é administrador desta instituição."). Assistido e tarefeiro comum reprovados pelo guard `is_active_admin`. Nenhum vínculo global é criado. Projeto Tratamentos FER original intocado.

## FIX07 — Regressão no acesso operacional do Tarefeiro

**Sintoma:** após FIX06, o usuário "Tarefeiro Teste" entrava na FER Piloto mas continuava aparecendo como **ASSISTIDO** no rodapé lateral e via apenas o menu "Meu Espaço" (Meus Tratamentos / Minha Agenda / Documentos). O acesso operacional de Tarefeiro havia sido concedido corretamente em Gestão de Acesso e o vínculo `instituicao_usuarios` estava ativo — logo, a regressão não estava na gravação nem no RLS.

**Causa técnica:** o hook `AuthContext.fetchRoleAndProfile` selecionava o role efetivo pegando o **primeiro item** da resposta de `user_roles` (`list[0]`). Como a query não define `ORDER BY` e o PostgREST não garante ordem, um usuário que acumulasse `assistido` (papel base auto-criado) + `tarefeiro` (concedido depois) podia ter `role = "assistido"` fixado como efetivo. A sidebar/dashboard usam esse `role` colapsado para escolher menu e badge, então o operacional ficava invisível apesar de o usuário tê-lo no array `roles`.

**Correção:** `src/contexts/AuthContext.tsx` passa a resolver o role efetivo por **prioridade determinística**:

```
admin > coordenador_de_tratamento > entrevistador > tarefeiro > assistido
```

`administrador_master`/`admin` continuam colapsando em `admin` (comportamento anterior preservado). Guards de rota não são afetados: `ProtectedRoute` já checa o array completo `roles`, então nenhum acesso é ampliado — apenas a **exibição** e o **dashboard padrão** passam a refletir o papel operacional quando ele coexiste com `assistido`.

**Menu esperado para Tarefeiro (inalterado):** Painel Inicial, Notificações, Ajuda, Assistidos leitura via módulos operacionais permitidos (Agenda de Entrevistas, Registro de Presenças, Avisos de Ausência, Agendar Entrevista, Sessões Públicas, Relatórios). Nenhum item administrativo/comercial/global (Usuários, Permissões, Plano e Assinatura, Portal Admin, Central de Assinaturas) é adicionado.

**Segurança:** nenhum papel administrativo é concedido; `platform_admins` intocado; RLS inalterada; sem cross-tenant; projeto Tratamentos FER original intocado.

**Testes:**

- `src/test/governanca/saas06c1-fix07-prioridade-role-operacional.test.ts` — 3/3 ✅.
- Suítes anteriores da homologação C1 (FIX01..FIX06) permanecem verdes — a correção é escopo `AuthContext` e não altera contratos de dados/rotas.

---

## Checkpoint anti-regressão pós-Fase 3 (pré-Fase 4)

**Data:** 2026-07-09
**Escopo:** confirmação da suíte cumulativa SAAS-06-C1 antes de avançar para a Fase 4 da homologação manual.

### Suítes verdes (governança C1)

| Fase | Suíte | Resultado |
| --- | --- | --- |
| 1 | `saas06c1-homologacao-fer-piloto.test.ts` (branding, tenant switcher, RequireInstituicao, guards operacionais, isolamento) | ✅ 19/19 |
| 1 | `saas06c1-fix01-tenant-header-clareza.test.ts` | ✅ 12/12 |
| 2 | `saas06c1-fix03-solicitacoes-comerciais-visual.test.ts` (Plano e Assinatura, módulos, solicitações comerciais) | ✅ 12/12 |
| 3 | `saas06c1-3-2b-bloqueio-rotas-globais.test.ts` (admin local não acessa rotas globais) | ✅ 9/9 |
| 3 | `saas06c1-3-3b-sem-vinculo-nao-acessa.test.ts` (usuário sem vínculo ativo não entra no tenant) | ✅ 12/12 |
| 3 | `saas06c1-fix04-voluntario-errors.test.ts` | ✅ 6/6 |
| 3 | `saas06c1-fix05-atuacao-acesso.test.ts` | ✅ 6/6 |
| 3 | `saas06c1-fix06-vinculo-institucional.test.ts` | ✅ 6/6 |
| 3 | `saas06c1-fix07-prioridade-role-operacional.test.ts` (tarefeiro operacional) | ✅ 3/3 |

**Total C1:** 9 arquivos · 85/85 testes ✅.

### Verificações globais

- **Suíte completa do projeto:** `vitest run` → **144 arquivos · 1949/1949 ✅** (nenhuma regressão em Tratamentos FER, governança, RLS, contratos, IA, notificações, agenda ou relatórios).
- **Typecheck:** `tsgo --noEmit` → **exit 0**, sem diagnóstico.
- **Build:** não requerido neste checkpoint (mudanças anteriores já validadas pelo pipeline padrão do sandbox); nenhuma alteração de código neste ciclo.

### Preservação do projeto Tratamentos FER original

- Nenhuma migração de banco criada neste checkpoint.
- Nenhum dado real migrado; base do piloto continua com o dataset fictício da homologação.
- Nenhuma assinatura, plano ou módulo alterado indevidamente: matriz atual de `assinatura_modulos` da FER Piloto permanece a mesma registrada em FIX01–FIX07.
- Guards `PlatformAdminRoute`, `RequireInstituicao`, `allowedIds` e prioridade determinística de role (`admin > coordenador > entrevistador > tarefeiro > assistido`) seguem íntegros.

### Decisão

**Checkpoint anti-regressão aprovado.** Autorizado avançar para a **Fase 4** da homologação manual da FER Piloto. Nenhuma correção adicional é necessária antes do próximo ciclo.

## FIX08 — Cadastro de assistido e padronização de erros amigáveis

### Erro encontrado
Fase 4, Teste 4.1 — admin local da FER Piloto tenta cadastrar "Assistido Teste 01" em Atendimento → Assistidos → Novo Assistido. O toast exibe o erro cru:

> new row violates row-level security policy for table "assistidos"

### Causa técnica
1. O `INSERT` em `public.assistidos` era feito sem `instituicao_id`. A coluna é `NOT NULL` e a policy `shadow_tenant_all_assistidos` exige `current_instituicao_id() = instituicao_id`, mas o GUC `app.current_instituicao` não é definido pelas requisições diretas ao PostgREST — só por RPCs `SECURITY DEFINER` específicas. Fora dessas RPCs, apenas `platform_admin` conseguia inserir, e mesmo assim faltaria o `instituicao_id`.
2. O tratamento de erro do frontend jogava `error.message` direto no toast, vazando termos técnicos (`row-level security`, `policy`, nome da tabela) para o usuário final.

### Correção aplicada
- **Backend** (`supabase/migrations`): nova policy `admin_instituicao gerencia assistidos do tenant` em `public.assistidos` (`FOR ALL TO authenticated`), usando `fn_is_admin_instituicao(auth.uid(), instituicao_id)` — mesmo padrão do FIX04 para `voluntarios`. Não amplia acesso a `anon`, assistidos ou tarefeiros; só admin local da instituição alvo insere/edita/exclui.
- **Frontend** (`src/pages/Assistidos.tsx`):
  - Consome `useInstituicaoAtiva()` e inclui `instituicao_id: selectedInstituicaoId` no payload de INSERT.
  - Falha-fechado antes do request quando não há instituição ativa, com mensagem amigável do helper.
- **Helper de erros** (`src/lib/supabaseFriendlyErrors.ts`): novo mapeador central `toFriendlyError(error, ctx)` traduz códigos técnicos comuns (`42501`, `23505`, `23502`, `23514`) em mensagens em português, sem vazar SQL, nome de tabela ou SQLSTATE ao usuário. Fornece `code` curto (`ASSISTIDOS_INSERT_DENIED`, `..._DUPLICATE`, `..._REQUIRED`, `..._UNEXPECTED`) e `formatSupportDetails` para o bloco "Detalhes técnicos para suporte".

### Regras reforçadas
- `instituicao_id` do novo assistido = **instituição ativa** do contexto; nunca inferido de outro tenant.
- Sem instituição ativa → operação bloqueada no cliente com mensagem: "Não foi possível identificar a instituição atual. Selecione uma instituição e tente novamente."
- Erros de banco no cadastro geram, no máximo, uma das mensagens amigáveis padronizadas + bloco discreto de "Detalhes técnicos para suporte" com código e operação — nunca `row-level security`, `policy`, `assistidos`, `PostgREST` ou `SQLSTATE` crus.
- Erro técnico completo permanece em `console.error` para diagnóstico interno.

### Testes executados
- `src/test/governanca/saas06c1-fix08-assistido-erros-amigaveis.test.ts` — 7/7 ✅ (cobre RLS por SQLSTATE, RLS por mensagem, 23505, 23502, tenant ausente, erro inesperado, sanitização em `formatSupportDetails`).
- Suíte cumulativa `src/test/governanca` — **1075/1075 ✅**.
- `tsgo --noEmit` — exit 0.

### Confirmação anti-regressão
- Voluntários/tarefeiro (FIX04/FIX06/FIX07), solicitações comerciais (FIX02), Plano e Assinatura e módulos permanecem verdes.
- Nenhuma alteração em `Tratamentos FER` original, planos ou assinaturas comerciais.
- Nenhum dado real migrado.

### Critério de aceite
Atendido: admin local da FER Piloto agora consegue cadastrar assistido fictício, o registro fica restrito ao tenant correto via policy `admin_instituicao gerencia assistidos do tenant`, nenhum erro técnico bruto é exibido ao usuário e a suíte cumulativa SAAS-06-C1 segue verde.

---

## FIX09 — Correção da criação de Sessão Pública e padronização de erro amigável (Fase 4, Teste 4.6)

### Sintoma
Ao clicar em "Criar Sessão para Hoje" em Atendimento → Sessões Públicas, o admin local da FER Piloto recebia:

```
new row violates row-level security policy for table "sessoes_publicas"
```

### Causa
Mesmo padrão diagnosticado no FIX08: a policy `shadow_tenant_all_sessoes_publicas` depende do GUC `app.current_instituicao`, que **não** é setado em requisições diretas via PostgREST. Sem o GUC, `current_instituicao_id()` retorna NULL e o `WITH CHECK` falha, mesmo para o admin local legítimo da instituição.

### Correção aplicada
- **Backend** (migration): nova policy `admin_instituicao gerencia sessoes_publicas do tenant` em `public.sessoes_publicas`, restrita a `authenticated`, usando `public.fn_is_admin_instituicao(auth.uid(), instituicao_id)` em `USING` e `WITH CHECK`. Não amplia acesso para `anon`, não permite cross-tenant e não afrouxa a policy existente.
- **Frontend** (`src/pages/SessoesPublicas.tsx`):
  - `criarSessaoHoje` agora usa `selectedInstituicaoId` do `InstituicaoContext`, com fail-closed antes do INSERT.
  - Checagem de duplicidade escopada por `instituicao_id`.
  - Erros do Supabase passam pelo helper `toFriendlyError(entidade: "sessoes_publicas", operacao: "criar_sessao_publica", acao: "INSERT")`, gerando código curto `SESSOES_PUBLICAS_INSERT_DENIED` e mensagem: "Não foi possível criar a sessão pública. Verifique se a instituição atual está selecionada e se você possui permissão para esta ação. Se o problema continuar, abra um chamado técnico para o administrador geral da plataforma." (via `MSG_PERMISSION_GENERIC` do helper reaproveitado).
  - `ToastAction` "Abrir chamado técnico" invoca `abrirChamadoTecnico` (`src/lib/abrirChamadoTecnico.ts`), que copia origem, código, operação, instituição, usuário, timestamp e mensagem para a área de transferência e loga um marcador estruturado no console (`[chamado-tecnico:pending-fix10]`).
- Import `requireInstituicaoId` removido do arquivo (fluxo agora unificado via contexto).

### Regras reforçadas
- Sessão pública nasce sempre com `instituicao_id = instituição ativa`; sem instituição selecionada, a operação é bloqueada no cliente.
- Nenhum toast/erro exibe `row-level security`, `policy`, `sessoes_publicas`, `PostgREST` ou SQLSTATE cru.
- Erro técnico gera código curto padronizado e ação clara para escalonamento.

### FIX10 — preparação
Documento formal criado em `docs/SAAS-06-C1-CENTRAL-CHAMADOS-ANEXOS.md`:
- Modelo de dados (`chamados_suporte`, `chamado_mensagens`, `chamado_anexos`).
- Bucket privado `suporte-anexos` com signed URLs curtas.
- RLS por perfil (`platform_admin` global, `admin_instituicao` por tenant, autor restrito ao próprio chamado, `anon` sem acesso).
- Fluxo do botão "Abrir chamado técnico" migrando do stub atual para uma RPC `fn_abrir_chamado_tecnico`.
- Notificações reaproveitando a fila do SAAS-06-B0.4 e auditoria via `audit_logs`.
- Escopo de UI para admin local e platform_admin.
- Bateria de testes obrigatória para a entrega do FIX10.

Nenhuma tabela/bucket/UI de chamados é criada neste ciclo — apenas o design aprovado e o stub que já entrega valor imediato ao usuário (código copiável para escalar ao administrador geral).

### Critério de aceite
- FIX09: admin local da FER Piloto cria sessão pública sem erro RLS; falha (se ocorrer) gera mensagem amigável + código técnico + botão "Abrir chamado técnico". Isolamento por tenant preservado.
- FIX10: preparação registrada em documento próprio, pronto para virar recorte de implementação.

## SAAS-06-C1-FIX11 — Separação clara entre visão global do platform_admin e contexto de tenant

### Erro observado
Ao logar como `saulocmoreira@gmail.com` (platform_admin com vínculo local **inativo** com a FER Piloto), o Portal reconhecia corretamente o papel global ("Você é administrador da plataforma"), porém o **shell** continuava estampando branding institucional:

- Header: `FER Piloto — Sistema de Gestão`.
- Sidebar: logo/nome da instituição pilotada.
- Bloco "Minhas instituições": FER Piloto aparecia como "indisponível" misturada com instituições operacionais reais.

### Causa raiz
O header (`AppLayout`) e a sidebar (`AppSidebar`) faziam `select` cru em `instituicao_config` sem passar pelo `InstituicaoContext`. Como a RLS de `instituicao_config` para platform_admin permite ver linhas de várias instituições, o primeiro registro retornado virava rótulo do shell — independentemente de haver ou não instituição selecionada. Resultado: platform_admin sem tenant ativo herdava marca de tenant qualquer.

### Regra adotada
1. **Fonte única do branding do shell é o `InstituicaoContext` + `useTenantBranding`**. Não há mais leitura direta de `instituicao_config` no `AppLayout`/`AppSidebar`.
2. **Sem tenant selecionado + platform_admin** → header e sidebar exibem branding global do Portal (`Portal Casa Espírita — Administração da Plataforma`).
3. **Sem tenant selecionado + usuário comum** → branding neutro do SaaS (`Portal Casa Espírita — Acolhimento · Organização · Renovação`).
4. **Com tenant selecionado** (necessariamente `vinculo_status = ativo`, garantido por `useSelectedInstituicao` + `allowedIds`) → branding do próprio tenant.
5. **Vínculos locais inativos** aparecem no Portal em um card separado ("Vínculos locais inativos"), com aviso explícito ao platform_admin de que a gestão dessas instituições continua acessível pela visão global.

### Comportamento esperado
- **Platform admin**: cai em visão global; pode acessar Portal Admin, Central de Assinaturas, Chamados globais e Instituições; para operar dentro de uma casa, precisa selecionar explicitamente uma instituição ativa via `TenantSwitcher` ou pela lista do Portal.
- **Admin local**: shell reflete a instituição ativa; vínculos inativos não permitem operar; visão global permanece bloqueada (mantido por `PlatformAdminRoute`).
- **Assistido**: comportamento inalterado (redirect para dashboard).

### Segurança
- Nenhuma alteração de RLS, RPC, GRANT ou migração.
- `useSelectedInstituicao` continua fail-closed: id fora de `allowedIds` é descartado do `localStorage` e ignorado por `storage` events.
- Nenhum vínculo ativado automaticamente. Nenhum papel concedido automaticamente.
- Projeto Tratamentos FER original: não tocado.

### Arquivos alterados
- `src/components/AppLayout.tsx` — header consumido de `useInstituicaoAtiva` + `useTenantBranding`; removida leitura direta de `instituicao_config`.
- `src/components/AppSidebar.tsx` — mesmo tratamento no cabeçalho da sidebar.
- `src/pages/Portal.tsx` — separação visual entre vínculos ativos e inativos.
