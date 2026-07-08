# SAAS-06-A2 — Blindagem de experiência por perfil no Portal

Status: ✅ Concluído
Escopo: Portal Casa Espírita (SaaS)
Impacto no projeto Tratamentos FER original: **nenhum**

## Objetivo

Garantir separação rigorosa da experiência por perfil no Portal:
assistidos e usuários não administrativos **nunca** enxergam card, botão,
rota ou menu de administração global da plataforma. Apenas
`platform_owner`/`platform_admin` acessam a visão administrativa.

## Regras aplicadas

### 1. Card "Você é administrador da plataforma"

Renderiza somente quando **todas** as condições forem verdadeiras:

- Usuário autenticado.
- `isPlatformAdmin === true` (fonte: tabela `platform_admins`, lida em
  `usePortalHub`).
- `role !== "assistido"` (defesa em profundidade — mesmo que um bug futuro
  contamine `isPlatformAdmin`, o card não vaza para a superfície do
  assistido).

Nunca aparece para: assistido, usuário comum, voluntário, tarefeiro,
entrevistador, coordenador local, admin local, usuário sem vínculo, vínculo
inativo.

### 2. Assistido no Portal

Assistido "puro" (único papel = `assistido` **e** `isPlatformAdmin === false`)
é redirecionado imediatamente para `/dashboard` ao tentar abrir `/portal`.
A experiência do assistido acontece pelo `AssistidoMobileNav` +
`AssistidoDashboard` (meu perfil, meus tratamentos, minha agenda, meus
documentos, notificações, ajuda). O Portal SaaS é uma superfície de gestão
multi-instituição — não pertence à jornada do assistido.

### 3. Admin local ≠ Platform admin

Admin local da instituição (`papel_local = admin_instituicao` em
`instituicao_usuarios`) administra apenas a própria casa. **Não** é
`platform_admin` e **não** enxerga a visão administrativa global. O hook
`usePortalHub` deriva `isPlatformAdmin` exclusivamente de `platform_admins`
— nunca de `papel_local`.

### 4. Platform admin / Platform owner

Enxerga: card administrativo no Portal, `/portal/admin`, Central de
Assinaturas (`/portal/admin/assinaturas`), visão global de instituições,
planos e assinaturas.

### 5. Múltiplos papéis

Quando um mesmo usuário acumula papéis (ex.: `assistido` + `entrevistador`),
o redirect assistido só dispara se **todos** os papéis forem `assistido`
(`roles.every(r => r === "assistido")`). O card administrativo continua
gated por `isPlatformAdmin` real.

## Rotas protegidas

| Rota                         | Guard                                             |
|------------------------------|---------------------------------------------------|
| `/portal`                    | `ProtectedRoute` (autenticação) + redirect assistido puro |
| `/portal/admin`              | `PlatformAdminRoute` (novo) + RLS backend          |
| `/portal/admin/assinaturas`  | `PlatformAdminRoute` (novo) + RLS backend          |

`PlatformAdminRoute` é defesa em profundidade: mesmo que a UI vaze um link,
o wrapper redireciona para `/portal` quando `isPlatformAdmin === false`.
A fonte de verdade continua sendo a RLS de `platform_admins`,
`instituicoes`, `assinaturas` etc.

## Testes executados

Suíte: `src/test/governanca/saas06a2-blindagem-perfil-portal.test.ts`

Cobre:

- Existência e comportamento fail-closed do `PlatformAdminRoute`.
- Envoltura das rotas `/portal/admin` e `/portal/assinaturas`.
- Redirect do assistido puro no `Portal.tsx`.
- Gate combinado `isPlatformAdmin && role !== "assistido"` para o card.
- Presença única do CTA "Abrir visão administrativa".
- `isPlatformAdmin` derivado apenas de `platform_admins`.

## Riscos remanescentes

- **UI-only**: o guard `PlatformAdminRoute` é defesa em profundidade. A
  segurança efetiva permanece na RLS do banco. Se novas tabelas
  administrativas forem adicionadas, sua RLS precisa vetar leitura para
  não-`platform_admin`.
- **Múltiplos papéis futuros**: caso um assistido receba também papel
  administrativo local, o redirect não dispara (comportamento correto), mas
  a UX de "contexto assistido puro" precisará ser modelada explicitamente
  em fase posterior (fora do escopo A2).
- **Admin local**: hoje admin local não tem UI administrativa global e
  seguirá sem — a Central de Assinaturas é exclusiva do platform_admin.

## Fora do escopo

- Regras de negócio dos tratamentos.
- Projeto Tratamentos FER original (intocado).
- Migração de dados reais.
- Cobrança e planos.
- RLS/policies/RPCs (nenhum acesso indevido real foi identificado).

## Delta de indicadores

- 0028: **+0**
- 0025: **+0**
- 0029: **+0**
