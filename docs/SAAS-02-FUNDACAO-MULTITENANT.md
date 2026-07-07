# SAAS-02 — Fundação Multi-tenant

**Status:** Concluído
**Escopo:** Núcleo estrutural SaaS. **Não** tenantiza tabelas funcionais (agenda, assistidos, tratamentos, presenças, notificações).
**Migração:** `supabase/migrations/2026070718*_saas02_*.sql` (aplicada via ferramenta de migração — nomes gerados pelo sistema).

---

## 1. Tabelas criadas

| Tabela | Objetivo |
|---|---|
| `instituicoes` | Catálogo de tenants (casas espíritas). Slug único, contatos, cidade/UF, status. |
| `instituicao_usuarios` | Vínculo N:N usuário↔instituição com papel local e status. Fonte da verdade de membership. |
| `modulos` | Catálogo global de módulos da plataforma (`tratamentos`, `biblioteca`, `caixa`, `portal`). |
| `planos` | Catálogo global de planos comerciais (`essencial`, `fraterno`, `completo`, `enterprise`). |
| `plano_modulos` | Composição plano ↔ módulos. |
| `assinaturas` | Assinatura ativa de cada instituição em um plano, com trial/datas/status. |
| `platform_admins` | Papel **global** da plataforma (SC Moreira Tech). Separado de `user_roles` (que continua tenant-scoped no futuro). |

## 2. Enums

- `saas_instituicao_status`: `implantacao | ativa | inativa | suspensa`
- `saas_assinatura_status`: `trial | ativa | suspensa | cancelada | inadimplente`
- `saas_vinculo_status`: `pendente | ativo | inativo`
- `saas_papel_local`: `admin_instituicao | coordenador | entrevistador | tarefeiro | assistido | leitor | caixa | bibliotecario`
- `saas_papel_global`: `platform_owner | platform_admin | support | billing_admin`

## 3. Modelo de papéis

Separação intencional em **duas camadas**, sem alterar `user_roles` existente:

- **Global (plataforma):** `platform_admins`. Papéis da SC Moreira Tech. Nunca escopados por tenant.
- **Local (tenant):** `instituicao_usuarios.papel_local`. Um usuário pode ter papéis diferentes em instituições diferentes; um mesmo papel só uma vez por tenant (UNIQUE `(instituicao_id, user_id, papel_local)`).

A adaptação do `user_roles` atual para tenancy é tarefa de recorte futuro (`SAAS-03`).

## 4. Helpers SECURITY DEFINER

Evitam recursão RLS e centralizam o filtro de tenancy:

- `public.is_platform_admin(_user_id)`
- `public.user_pertence_instituicao(_user_id, _instituicao_id)`
- `public.user_tem_papel_local(_user_id, _instituicao_id, _papel)`
- `public.user_is_admin_instituicao(_user_id, _instituicao_id)`

Todas endurecidas: `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated, service_role` — preserva a diretriz 0028.

## 5. Regras de RLS (resumo)

| Tabela | Leitura | Escrita |
|---|---|---|
| `instituicoes` | membro ativo do tenant OU platform_admin | `UPDATE`: admin local do próprio tenant OU platform_admin |
| `instituicao_usuarios` | próprio usuário OU admin local do tenant | admin local do tenant (INSERT/UPDATE/DELETE) |
| `assinaturas` | membro do tenant OU platform_admin | platform_admin |
| `modulos` / `planos` / `plano_modulos` | qualquer autenticado (catálogo público interno) | platform_admin |
| `platform_admins` | próprio usuário OU platform_admin | apenas `service_role` |

**Nenhuma policy permite acesso cruzado entre tenants.** Sem contexto válido (usuário não autenticado ou sem vínculo), toda leitura retorna vazio (fail-closed).

## 6. Estratégia de tenant ativo

Por ora, o tenant é derivado do vínculo via `user_pertence_instituicao(auth.uid(), <inst>)`. Nas telas SaaS futuras (`SAAS-05`), o header conterá um seletor de tenant que persiste o tenant ativo em `app_metadata.instituicao_ativa` (JWT) ou em cookie, e as queries passarão a assumir esse contexto por padrão.

Nada disso é feito neste recorte — apenas a estrutura de vínculo, que é a base para o seletor.

## 7. Seed sintético

Aplicado idempotentemente:
- 4 módulos: `tratamentos`, `biblioteca`, `caixa`, `portal`.
- 4 planos: `essencial`, `fraterno`, `completo`, `enterprise`.
- Composição plano↔módulos coerente com a descrição comercial.
- 1 instituição demo: `Casa Espírita Demo` (slug `casa-demo`, `São Paulo/SP`, status `ativa`).
- 1 assinatura demo: plano `completo`, status `trial`, `trial_ate = hoje + 30 dias`.

**Nenhum dado real da FER foi copiado.** Nenhum e-mail/CPF/telefone real foi introduzido.

## 8. Confirmações de escopo

- Nenhuma tabela funcional pré-existente (`assistidos`, `agenda_tratamentos_assistido`, `entrevistas`, `presencas`, `tratamentos`, `notificacoes*`, `avisos_internos`, `sessoes_publicas`, etc.) foi alterada.
- Nenhum fluxo de cadastro público, login, `AuthContext` ou `ProtectedRoute` foi alterado.
- Nenhum código de fila/dispatcher/provider/template foi tocado.
- Nenhuma integração de cobrança, Stripe ou Mercado Pago foi criada.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Vazamento entre tenants por policy esquecida | Toda tabela nova filtra por `instituicao_id` via helper SECURITY DEFINER; suíte de isolamento (§ 10) valida. |
| `user_roles` legado ainda global (sem tenancy) | Fora de escopo. Tratado em `SAAS-03`. Enquanto isso, papéis globais legados coexistem com o modelo novo sem conflito, pois nenhuma tabela SaaS lê `user_roles`. |
| Confusão entre papel local e papel global | Documentação explícita; tabelas separadas; nomes de enums distintos. |
| Trial demo permanecer indefinidamente | `trial_ate` cadastrado; regra de expiração é objeto de recorte de billing (`SAAS-07`). |
| Baseline de linter herdado do remix | O remix não incluiu todas as migrações de hardening do FER original; este recorte **não introduz novos 0028** (revokes emitidos), mas o baseline herdado permanece e será tratado em recorte de segurança dedicado. |

## 10. Testes de isolamento

- **Contratos (Vitest, sempre no CI):** `src/test/governanca/saas02-fundacao-multitenant.test.ts` — valida catálogo de enums, papéis, formato de policies e regras esperadas (fonte única no código).
- **Banco real (opcional, `test:db`):** `src/test/integration/db/saas02-isolamento-tenants.dbtest.ts` — sob `HAS_DB=true`, semeia dois tenants A e B com um usuário membro apenas de A e prova que:
  1. Usuário de A não lê `instituicoes` de B via helper de tenancy.
  2. Usuário sem vínculo não lê nenhuma instituição.
  3. `user_is_admin_instituicao` de A em B retorna `false`.
  4. `user_pertence_instituicao` retorna apenas o tenant correto.
  5. Assinatura de B invisível para membro de A.

## 11. Próximos recortes recomendados

- **SAAS-03** — Migração de `user_roles` para tenancy (`user_id + instituicao_id + role`), com preservação retroativa como tenant único FER.
- **SAAS-04** — Onboarding de instituição (signup + aprovação + primeiro admin local).
- **SAAS-05** — Seletor de tenant no header, tenant ativo no JWT.
- **SAAS-06** — Adaptação do módulo Tratamentos: adicionar `instituicao_id` em `assistidos`, `agenda_tratamentos_assistido`, `tratamentos`, `presencas`, `entrevistas` e refatorar policies para exigir `instituicao_id = current_tenant()`.
- **SAAS-07** — Billing/planos (expiração de trial, cobrança).
- **SAAS-08** — Console de plataforma SC Moreira Tech.

---

**Indicadores** (baseline do remix; verificar via linter):
- `0028`: **176** herdados do remix; **0 introduzidos por SAAS-02** (todos os SECURITY DEFINER novos com `REVOKE FROM PUBLIC, anon`). Tratamento do baseline herdado ficará em recorte de segurança dedicado.
- `0025`: sem alteração introduzida por SAAS-02.
- `0029`: sem alteração introduzida por SAAS-02.
