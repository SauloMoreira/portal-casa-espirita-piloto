# Estratégia de Qualidade, Testes e CI/CD

Este documento descreve como rodar os testes, o que está coberto, como
funciona o pipeline e como investigar falhas.

## Comandos

Use o gerenciador padrão do projeto (**Bun**).

| Comando                     | O que faz                                              |
| --------------------------- | ------------------------------------------------------ |
| `bun run lint`              | ESLint                                                  |
| `bun run typecheck`         | Checagem de tipos (`tsc --noEmit`)                     |
| `bun run test`              | Testes unitários + integração (Vitest, execução única) |
| `bun run test:unit`         | Apenas testes unitários (`src/lib`)                    |
| `bun run test:integration`  | Apenas testes de integração (`src/test/integration`)  |
| `bun run test:watch`        | Vitest em modo watch                                    |
| `bun run test:e2e`          | Testes ponta a ponta (Playwright)                      |
| `bun run build`             | Build de produção                                       |
| `bun run validate`          | lint + typecheck + testes + build (gate completo)      |

## Estratégia de testes

A cobertura é **estratégica, não artificial**: priorizamos os fluxos críticos
e as regras de negócio centrais, aproveitando a arquitetura refatorada
(`services` → `hooks` → `components`) e os helpers puros.

### 1. Testes unitários (`src/lib/*.test.ts`)

Protegem regras e funções puras:

- **`validators.test.ts`** — CPF, CNPJ, telefone, e-mail, CEP e máscaras.
- **`normalize.test.ts`** — normalização de nome e celular (anti-duplicidade).
- **`ageGroups.test.ts`** — cálculo de idade e faixas etárias (dashboards).
- **`agenda.test.ts`** — helpers de data/horário da agenda.
- **`fazerEntrevista.test.ts`** — geração de datas de sessão e aplicação da
  quantidade padrão de sessões (regra de sequência/agenda real).

### 2. Testes de integração (`src/test/integration/*.test.ts`)

Combinam helpers como os fluxos reais fazem:

- **`agendaGeneration.test.ts`** — pipeline entrevista → tratamento → agenda
  real (contagem correta, sem datas duplicadas, dia da semana respeitado).
- **`checkinDedupe.test.ts`** — regras de deduplicação do check-in público
  (mesma pessoa por variação de nome/telefone não duplica).

### 3. Testes E2E (`e2e/*.spec.ts`)

Validam navegação, rotas e telas de entrada sem depender de credenciais:

- **`auth-routes.spec.ts`** — login, redirecionamento de rotas protegidas,
  recuperação de senha.
- **`checkin-publico.spec.ts`** — a tela pública de check-in carrega sem
  quebrar mesmo com token inválido.

> Fluxos autenticados (realizar entrevista, presença, voluntários) são cobertos
> primariamente pelos testes de unidade/integração das regras puras. Para E2E
> autenticado, configure um usuário de teste e estenda os specs em `e2e/`.

## Pipeline CI/CD (`.github/workflows/ci.yml`)

Dois jobs, em `push`/`pull_request` para `main`:

1. **quality** — `bun install --frozen-lockfile` → lint → typecheck → testes →
   build. Qualquer etapa que falhar **reprova** o pipeline (não há "passar
   quebrado").
2. **e2e** — roda após `quality`, instala o Chromium e executa os testes
   Playwright.

### Como interpretar falhas

- **lint** → erro de estilo/regra ESLint: ver arquivo/linha apontado.
- **typecheck** → erro de tipo: rode `bun run typecheck` localmente.
- **test** → regra/fluxo quebrado: o nome do teste indica a regra afetada.
- **build** → erro de compilação/import: rode `bun run build`.
- **e2e** → regressão de navegação/UI: ver o relatório do Playwright.

## Observabilidade

As edge functions sensíveis usam logging estruturado (JSON de linha única) via
`supabase/functions/_shared/logger.ts`, com `requestId` para correlação:

- `create-user` — `user_created`, `create_rolled_back`, `create_failed`.
- `reset-password` — `reset_requested`, `reset_succeeded`, `reset_failed`.
- `checkin-publico` — `checkin_rejected`, `checkin_failed`.

No frontend, o `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) registra
erros de render com escopo `ui-error-boundary` e exibe um fallback recuperável
nas páginas principais (Dashboard, Agenda, Fazer Entrevista, Voluntários,
Sessões Públicas, área do assistido e check-in público).

### Investigando erros críticos

1. Reproduza o fluxo e capture o `requestId` retornado/logado.
2. Filtre os logs da edge function pelo `requestId` e pelo `event`.
3. Para erros de UI, procure por `ui-error-boundary` no console com o `label`
   da página.
