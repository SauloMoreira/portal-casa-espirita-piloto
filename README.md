# Plataforma de Gestão — Casa Espírita

SaaS para gestão de atendimento, tratamentos, agenda, voluntários, sessões
públicas e inteligência operacional de casas espíritas.

## Stack

- **React 18 + Vite 5 + TypeScript 5**
- **Tailwind CSS v3** + shadcn/ui (componentes em `src/components/ui`)
- **TanStack Query** para estado de servidor
- **Backend (Lovable Cloud / Supabase):** Auth, PostgreSQL com RLS, Storage,
  Edge Functions, triggers e RPCs para a lógica crítica.

## Setup

Pré-requisito: [Bun](https://bun.sh) (gerenciador de dependências padrão deste
projeto — **não** use npm/yarn/pnpm para evitar lockfiles divergentes).

```bash
bun install        # instala dependências (usa bun.lock)
bun run dev        # ambiente de desenvolvimento (Vite)
```

### Variáveis de ambiente

Copie `.env.example` para `.env` e preencha. As variáveis `VITE_SUPABASE_*` são
geradas/gerenciadas pela plataforma. Nunca versione `.env` (já está no
`.gitignore`). Segredos sensíveis (service role, chaves de API) ficam apenas no
backend, nunca no front.

## Scripts

| Script             | Descrição                          |
| ------------------ | ---------------------------------- |
| `bun run dev`      | Servidor de desenvolvimento        |
| `bun run build`    | Build de produção                  |
| `bun run build:dev`| Build em modo desenvolvimento      |
| `bun run preview`  | Pré-visualiza o build              |
| `bun run lint`     | ESLint                             |
| `bun run typecheck`| Checagem de tipos (`tsc --noEmit`) |
| `bun run test`     | Testes unitários + integração (Vitest) |
| `bun run test:unit`| Apenas testes unitários            |
| `bun run test:integration` | Apenas testes de integração |
| `bun run test:e2e` | Testes ponta a ponta (Playwright)  |
| `bun run test:watch` | Testes em modo watch             |
| `bun run validate` | lint + typecheck + testes + build  |

Estratégia de testes, cobertura, pipeline CI/CD e observabilidade:
[`docs/TESTING.md`](docs/TESTING.md).



## Arquitetura

Visão resumida em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Resumo:

```text
src/
  constants/      # roles, rotas, status/enums centralizados
  types/          # tipos de domínio (sobre os tipos gerados do Supabase)
  services/       # camada de acesso a dados por domínio (queries centralizadas)
  hooks/          # hooks de domínio (regra/consulta desacoplada da UI)
  components/     # componentes visuais e de seção (ui/ = shadcn)
  pages/          # páginas/rotas
  contexts/       # contextos globais (Auth)
  integrations/   # cliente Supabase e tipos gerados (NÃO editar manualmente)
```

### Convenções de domínio

- **Agenda real** (`agenda_tratamentos_assistido`) é a **única fonte de
  verdade** para sessões. Telas, documentos e relatórios usam sessões reais,
  nunca regras teóricas do tratamento.
- Acesso a dados passa pela **camada de serviços** (`src/services`), consumida
  por **hooks de domínio** (`src/hooks`), consumidos pela UI.
- Rotas, papéis e status vêm de `src/constants` — evite strings soltas.
- Tipos de domínio vêm de `src/types` — evite `any` e casting solto.

### Segurança

RLS rigoroso com funções `SECURITY DEFINER` para evitar recursão. Papéis ficam
na tabela `user_roles` (nunca no profile). Rotas protegidas são *fail-closed*:
não abrem sem papel válido resolvido.
