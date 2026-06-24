# Arquitetura

Documento de referência da organização do código e das convenções adotadas na
frente de refatoração arquitetural.

## Camadas

```text
UI (pages / components)
        │  usa
        ▼
hooks de domínio (src/hooks)         ← estado + orquestração por fluxo
        │  chama
        ▼
serviços (src/services)              ← acesso a dados (queries Supabase)
        │  usa
        ▼
Supabase client (src/integrations)   ← gerado, não editar
```

Regra geral: **componentes não fazem queries diretas**. Eles consomem hooks de
domínio; hooks consomem serviços; serviços encapsulam o Supabase. Isso permite
trocar queries por RPCs/views/edge functions sem tocar na UI.

## Pastas

| Pasta             | Responsabilidade                                              |
| ----------------- | ------------------------------------------------------------ |
| `src/constants`   | Roles, rotas (`ROUTES`), status/enums. Fonte única.          |
| `src/types`       | Tipos de domínio sobre os tipos gerados do Supabase.         |
| `src/services`    | Acesso a dados por domínio. Funções async tipadas.           |
| `src/hooks`       | Hooks de domínio (`useSessoesPublicas`, `useAgendaTratamentos`, …). |
| `src/components`  | Componentes visuais e de seção. `ui/` = shadcn.              |
| `src/pages`       | Páginas/rotas (carregadas via `React.lazy`).                 |
| `src/contexts`    | Contextos globais (Auth).                                    |

## Constantes centrais

- `ROUTES` — todos os paths. Use em `navigate`, `<Link>`, sidebar e cards.
- `APP_ROLES` / `ROLE_LABELS` / grupos (`ADMIN_ONLY`, `STAFF_ROLES`, …).
- `*_STATUS`, `MODO_AGENDAMENTO`, `PRIORIDADE`, `DIAS_SEMANA` em `status.ts`.

## Tipos de domínio

Em `src/types/index.ts`. São aliases finos sobre `Tables<...>` (Supabase) —
ex.: `Assistido`, `SessaoAgendada`, `Voluntario`, `SessaoPublica`. Tipos de
view (dashboards/relatórios) em `src/types/dashboard.ts`
(`IndicadorDashboard`, `RelatorioFrequencia`, `InsightIA`, …).

## Performance

- **Route-level code splitting** via `React.lazy` + `Suspense` em `App.tsx`.
  As páginas de auth ficam eager; o restante é dividido por rota.

## Migração incremental

A refatoração é aditiva: constantes, tipos, serviços e hooks novos podem ser
adotados página a página sem big-bang. Ao tocar uma página monolítica:

1. mover as queries para um serviço de domínio;
2. extrair estado/orquestração para um hook de domínio;
3. quebrar a renderização em componentes de seção;
4. substituir strings soltas por constantes e `any` por tipos de domínio.

## Convenção crítica de negócio

A **agenda real** (`agenda_tratamentos_assistido`) é a única fonte de verdade
para sessões — presença, documentos e relatórios devem refletir registros
reais, nunca parâmetros teóricos do tratamento.

## Invariantes do sistema

As regras estruturais invioláveis (INV-*) que toda mudança deve preservar estão
catalogadas em [`docs/INVARIANTES.md`](./INVARIANTES.md). Confronte qualquer plano,
entrega ou teste com esse catálogo: *"Esta implementação preserva as invariantes do
sistema?"* — se a resposta for "não", a entrega não está pronta.
