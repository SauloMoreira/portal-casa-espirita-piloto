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

Ajuste aplicado:
- **1 instituição vinculada**: o header exibe um **badge informativo** (pílula `rounded-full`, fundo `muted/60`, sem borda de botão, sem chevron), com tooltip e `aria-label` "Instituição atual: <nome>", ícone de instituição preservado e truncamento mantido.
- **≥ 2 instituições vinculadas**: mantém o **seletor real** com botão, chevron e `DropdownMenu`, permitindo alternância entre instituições permitidas.
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

