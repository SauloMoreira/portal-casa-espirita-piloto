# Q2-E4-A — Diagnóstico final da conta auth legada sem profile (E1-10)

> **Recorte exclusivamente diagnóstico e read-only.** Nenhuma alteração
> produtiva realizada: sem migration, RPC, schema, tabelas, RLS, policies,
> grants, funções SQL, triggers, edge functions, UI, rotas, `user_roles` ou
> `profiles`. Apenas `SELECT` e leitura de código.

## 0. Indicadores (preservados)

- `0028 = 0`
- `0025 = 0`
- `0029 = 57`

`tsgo`: **não aplicável** — nenhum arquivo de código alterado (recorte só de
leitura + documentação).

## 1. Identidade real da conta

`user_id`: `29777e60-abe7-46dd-a8c3-f6fef6e29022`

| Campo | Valor |
|---|---|
| Existe em `auth.users`? | **Sim** (`deleted_at = null`) |
| `email` | **`e2e-rls-assistido@lovable.test`** |
| `created_at` | 2026-06-25 17:54:37 |
| `last_sign_in_at` | 2026-06-25 18:19:44 |

**Achado decisivo:** esta **não** é uma conta legada órfã de bug. É o **fixture
de teste do suite E2E-RLS**, referenciado explicitamente em
`src/test/e2e-rls/_rlsClient.ts:29`:

```
assistido: "e2e-rls-assistido@lovable.test"
```

O papel `assistido` é intencionalmente semeado para que os testes E2E-RLS
autentiquem como assistido e exerçam a RLS real
(`rpcs-sensiveis.e2etest.ts`, `avisos-ausencia.e2etest.ts`,
`entrevistas-privacidade.e2etest.ts`, `parametros-governados.e2etest.ts`).

## 2. Confirmações solicitadas

| # | Verificação | Resultado |
|---|---|---|
| 1 | Conta existe em `auth.users` | **Sim**, ativa (test fixture) |
| 2 | Role `assistido` em `user_roles` | **Sim** — 1 linha (`6d3999d1-…`, criada 2026-06-25 17:55). Nenhuma outra role. |
| 3 | Profile ausente em `profiles` | **Confirmado** — `count = 0` |
| 4a | `assistidos` (`user_id`/`created_by`) | **0** vínculos (fixture sintético é criado e limpo pelo `_seed.ts`) |
| 4b | `cadastro_solicitacoes` (`user_id`/`decidido_por`) | **0** |
| 4c | `audit_logs` (`user_id` = ator) | **8** linhas `aviso_ausencia_registrado` (25/06, 18:01–18:19) — artefatos de execução de teste; os `avisos_ausencia` referenciados **já não existem** (limpos pelo teardown) |
| 4d | `admin_promotion_requests`/`approvals` | **0** (não é ator nem alvo de governança) |
| 4e | `voluntarios` | N/A (tabela não possui `user_id`) |

## 3. Avaliação de impacto

- **Funcional:** **nenhum.** A conta não participa de nenhum fluxo produtivo
  (sem assistido ativo, sem solicitação, sem governança). Confirma o Q2-D1/D2:
  o autocadastro novo não depende dela.
- **Segurança:** **nenhum.** Possui apenas a role base `assistido` (menor
  privilégio). E-mail de domínio de teste (`@lovable.test`), fora de produção.
  Remover/criar profile não altera superfície de risco.
- **Relatórios/contagens:** **desprezível.** Sem profile, não aparece em
  listagens de usuários baseadas em `profiles`. Os 8 `audit_logs` residuais
  são imutáveis por design (trilha histórica) e apontam para registros já
  removidos — não devem ser tocados.

## 4. Recomendação objetiva

**SEM AÇÃO.** Reclassificação do achado E1-10:

- O item deixa de ser "conta legada órfã a limpar" e passa a ser
  **fixture legítimo do suite E2E-RLS**.
- **Não remover a role** `assistido`: isso quebraria os testes E2E-RLS que
  autenticam como este usuário.
- **Não criar profile:** os testes não dependem de `profiles` para este
  fixture; criar um adicionaria estado não gerenciado pelo `_seed.ts`.
- **Não excluir a conta auth.**
- Os `audit_logs` residuais permanecem intocados (trilha imutável).

## 5. Q2-E4-B

**Não é necessário.** Como a recomendação é *sem ação*, não há execução a
propor. O backlog residual (E1-10) fica **encerrado como falso positivo**
(fixture de teste, não débito). Caso, no futuro, se deseje apenas cosmética,
a única melhoria opcional seria anotar o `user_id` como fixture em
`_rlsClient.ts` — mas isso é irrelevante e fora deste recorte.

## 6. Confirmação final

- Nenhuma alteração produtiva foi realizada.
- Apenas consultas `SELECT` (incluindo `auth.users` via ferramenta read-only)
  e leitura de código de teste.
- Indicadores preservados: `0028 = 0` · `0025 = 0` · `0029 = 57`.
