# SAAS-06-C1-STAB10-A — Plano de diagnóstico e correção

**Escopo:** provisionamento de acesso do assistido sem vínculo em `instituicao_usuarios`, causando loop Dashboard ↔ Portal.
**Modo:** somente plano. Nada será alterado até aprovação explícita.

---

## 1. Estado atual do Assistido Teste 01 (diagnóstico read-only)

Confirmado via consulta:

| Item | Valor |
|---|---|
| `assistidos.id` | `aef9ab7d-1a51-4ea1-96a1-97e0d2879d8c` |
| `assistidos.nome` | Assistido Teste 01 |
| `assistidos.user_id` | `18e2dceb-48ba-471d-ae9d-da52ef23865a` |
| `assistidos.instituicao_id` | `e3818702-cfac-47ae-b751-cb6a05babd4f` (FER Piloto) |
| `assistidos.status` | `em_tratamento` |
| `assistidos.deleted_at` | NULL |
| `profiles` para o user_id | 1 linha (`Assistido Teste 01`) |
| `user_roles` | 1 linha: `role = assistido` |
| **`instituicao_usuarios`** | **0 linhas — ausente** |
| Tratamentos do piloto | 7 vínculos (6 `aguardando_inicio` + 1 `aguardando_agendamento`) |
| Sessões em `agenda_tratamentos_assistido` | 48 sessões (2026-07-10 → 2026-12-18) |

Conta `auth.users`: não consultável pelo sandbox (schema `auth` sem permissão de leitura), mas o fluxo confirma existência (login funciona).

---

## 2. Causa raiz

**Ausência de linha em `instituicao_usuarios` para o `user_id` do assistido.**

- `create-user` grava `auth.users`, `profiles`, `user_roles` e `assistidos.user_id`, mas **não insere `instituicao_usuarios`**.
- `usePortalHub` lista instituições exclusivamente por `instituicao_usuarios WHERE user_id = auth.uid()` → retorna vazio.
- `InstituicaoContext.selecionada = null`.
- `RequireInstituicao` (guard de `/dashboard`) → `Navigate → /portal`.
- `Portal` detecta assistido puro sem vínculos e redireciona → `/dashboard`.
- Loop `/dashboard ⇄ /portal`. Painel jamais renderiza. Sidebar mostra branding genérico porque `useTenantBranding` também depende do tenant ativo.

---

## 3. Fluxo `create-user` atual (mapa)

`Assistidos.tsx → GerarAcessoAssistido.tsx → supabase.functions.invoke("create-user")`.

Etapas atuais na Edge Function (service_role):

1. Autentica chamador via anon client (`getUser`).
2. Autorização por papel global: `admin` ou `entrevistador` (assistido apenas).
3. `auth.admin.createUser({ email, password, email_confirm })`.
4. `user_roles insert { user_id, role }`.
5. `profiles insert { ...profile, user_id, created_by }`.
6. `assistidos update { status, observacoes, user_id }`.
7. Rollback: em qualquer falha pós-criação, `auth.admin.deleteUser(userId)`.

Gaps identificados:

- **Não insere `instituicao_usuarios`** (raiz do STAB10-A).
- **Não valida tenant do chamador vs. tenant do assistido** — service_role bypassa RLS; um admin de outro tenant poderia invocar com `assistido_id` alheio.
- Não valida que o assistido pertence à mesma instituição do operador.
- Não valida `assistido.user_id IS NULL` antes de sobrescrever.
- Nenhuma etapa é atômica: falha em `instituicao_usuarios` (futura) deixaria `profiles` + `user_roles` + `assistidos.user_id` órfãos → rollback só remove `auth.users`, mas as tabelas públicas permanecem inconsistentes se `deleteUser` não cascatear (depende de FKs).

---

## 4. Ciclo de redirecionamento comprovado

```
Login → /dashboard
  → RequireInstituicao (allowedIds = [])
  → Navigate /portal (reason: instituicao_ausente)
Portal
  → detecta assistido puro sem vínculos
  → Navigate /dashboard
  → RequireInstituicao → /portal → …
```

Nenhum componente filho de `/dashboard` é renderizado (guard é fail-closed antes do `AssistidoDashboard`).

---

## 5. Regra funcional esperada (correção futura)

Ao gerar acesso para um assistido, a Edge Function deve, no backend:

1. Derivar `instituicao_id` **exclusivamente** de `assistidos.instituicao_id`. Ignorar qualquer valor vindo do cliente.
2. Validar operador: possui vínculo ativo em `instituicao_usuarios` para a mesma `instituicao_id`, com papel autorizado (`admin` local, `administrador_master` ou `entrevistador` habilitado). Papel global `admin` sem vínculo local **não** basta (fecha o cross-tenant descoberto no gap acima).
3. Validar `assistidos.user_id IS NULL` e `deleted_at IS NULL`.
4. Validar e-mail não vinculado a outra conta.
5. Criar `auth.users`.
6. Executar **uma RPC transacional** `fn_provisionar_acesso_assistido(p_user_id, p_assistido_id, p_nome, p_celular)` que, em transação:
   - `insert profiles`;
   - `insert user_roles (role='assistido')`;
   - `insert instituicao_usuarios (instituicao_id, user_id, papel_local='assistido', status='ativo')`;
   - `update assistidos set user_id = p_user_id`;
   - reafirma todas as validações (defesa em profundidade).
7. Se a RPC falhar, Edge Function chama `auth.admin.deleteUser`. Auth criado sempre em último lugar antes da RPC minimiza janela de órfão.

**Cliente nunca envia** `instituicao_id`, `papel_local`, `status`, papéis elevados.

**Idempotência:** RPC detecta estado já provisionado (mesmo user_id + mesmo assistido + vínculo ativo) e retorna `already_provisioned` sem erro.

---

## 6. Fail-safe de navegação (independente da correção acima)

Mesmo com o fluxo corrigido, contas legadas ou erros de dados podem produzir assistido sem vínculo. Solução:

- Portal detecta `role = assistido` **sem** vínculos ativos e, em vez de redirecionar para `/dashboard`, renderiza tela dedicada com:
  - código `ASSISTIDO_SEM_VINCULO_INSTITUCIONAL`;
  - mensagem: "Seu acesso foi criado, mas ainda não está vinculado a uma instituição. Solicite a regularização ao administrador da casa.";
  - botão para abrir chamado / logout.
- `RequireInstituicao` permanece inalterado (não afrouxar guard).
- Nenhuma seleção de tenant baseada em input do cliente.
- Quebra o loop de forma determinística.

---

## 7. Estratégia de atomicidade / rollback / idempotência

| Aspecto | Estratégia |
|---|---|
| Atomicidade | RPC `SECURITY DEFINER` única para as 4 tabelas públicas; `auth.users` fora da transação (limitação da API admin). |
| Rollback | Falha da RPC → `auth.admin.deleteUser`. Falha de `deleteUser` → log + retorno de erro descritivo; RPC nunca deixou linhas parciais (transação). |
| Idempotência | RPC verifica `assistidos.user_id = p_user_id` + vínculo ativo. Se já consistente, retorna `already_provisioned`. Retry após timeout de rede é seguro. |
| Cross-tenant | RPC re-valida operador ∈ mesma instituição do assistido; rejeita mesmo com service_role. |

---

## 8. STAB10-A-R1 (recorte separado, não executar agora)

Reconciliação da conta atual do Assistido Teste 01:

- Migration cirúrgica com bloco `DO` e precondições bloqueantes;
- Verifica: `user_id = 18e2dceb…`, `assistido_id = aef9ab7d…`, `instituicao_id = e3818702…`, `role = assistido`, `instituicao_usuarios` ausente;
- `INSERT` de exatamente 1 linha em `instituicao_usuarios` (`papel_local='assistido'`, `status='ativo'`);
- Não toca em `auth.users`, `profiles`, `user_roles`, `assistidos`, tratamentos, sessões;
- Idempotente (skip se já existir);
- Auditoria via trigger existente ou log dedicado;
- Teste dbtest confirma vínculo criado + login → Dashboard sem loop.

---

## 9. Queries do painel do assistido (mapeamento — não alterar)

Confirmar que já filtram por `user_id` / tenant ativo:

- `AssistidoDashboard.tsx`
- `MeusTratamentos.tsx`
- `MinhaAgenda.tsx`
- `MeusDocumentos.tsx`
- `MeuPerfil.tsx`

Auditoria estática a fazer na Etapa 2, sem alterações. Dados existem no piloto (7 tratamentos, 48 sessões) e serão exibidos assim que o vínculo institucional permitir tenant ativo.

---

## 10. Arquivos potencialmente alterados na Etapa 2 (STAB10-A)

- `supabase/functions/create-user/index.ts` — validação tenant + chamada à nova RPC.
- `supabase/migrations/*_fn_provisionar_acesso_assistido.sql` — RPC transacional.
- `src/pages/Portal.tsx` — fail-safe para assistido sem vínculo.
- `src/components/GerarAcessoAssistido.tsx` — sem envio de `instituicao_id` (já não envia; conferir).
- Testes:
  - `src/test/integration/db/saas06c1-stab10a-provisionar-acesso.dbtest.ts`
  - `src/test/governanca/saas06c1-stab10a-fail-safe-portal.test.ts`

Nada mais será tocado sem nova aprovação.

---

## 11. NÃO será alterado

RLS, policies, grants, RPCs de tratamento/agenda, `auth.users`, `profiles`, `user_roles`, `assistidos`, tratamentos, sessões, dados do projeto Tratamentos FER original, STAB06/07/08/09, planos, módulos, assinaturas, tela de Usuários (STAB10-B), branding, tema.

---

## 12. Testes previstos (Etapa 2)

**Provisionamento (dbtest):**
- fluxo feliz cria auth + profile + role + instituicao_usuarios + vincula assistido;
- retry idempotente não duplica linhas;
- e-mail duplicado retorna erro amigável;
- assistido já com `user_id` rejeitado;
- operador de outro tenant rejeitado;
- RPC falha → auth user removido; nenhuma linha órfã.

**Fail-safe (governança/estático + comportamental):**
- assistido sem vínculo vê `ASSISTIDO_SEM_VINCULO_INSTITUCIONAL` no Portal, não é redirecionado;
- `RequireInstituicao` permanece fail-closed;
- assistido com vínculo passa direto para Dashboard (auto-select do tenant único).

**Regressão:**
- suítes SAAS-06-C1 + STAB07 + STAB09 continuam verdes;
- baseline de 5 falhas pré-existentes mantido;
- `tsgo --noEmit` e `bun run build` em Exit 0.

---

## 13. Riscos

- `auth.admin.deleteUser` pode falhar após rollback da RPC → janela de auth órfão. Mitigação: log estruturado + endpoint de limpeza.
- RPC `SECURITY DEFINER` amplia superfície: revogar `EXECUTE` do `public`/`anon`; conceder apenas a `service_role`.
- Introduzir validação tenant no `create-user` pode quebrar fluxos legítimos onde admin global provisionava sem vínculo local → auditar antes; documentar como *hardening* alinhado ao P1.
- Fail-safe no Portal precisa distinguir "assistido sem vínculo" de "carregando" para não piscar mensagem durante o loading do `usePortalHub`.

---

## 14. Critérios de aceite (Etapa 2, futura)

1. Novo acesso de assistido cria as 4 linhas atomicamente + vínculo ativo.
2. Login imediato leva ao Dashboard do assistido no tenant correto, sem loop.
3. Operador de outro tenant é rejeitado com `403 CROSS_TENANT`.
4. Portal exibe fail-safe amigável quando vínculo estiver ausente (sem loop).
5. STAB10-A-R1 reconcilia Assistido Teste 01 com 1 linha, sem tocar em tratamentos/sessões.
6. Todas as suítes verdes contra baseline; tsgo/build Exit 0.

---

**Aguardando aprovação explícita para executar Etapa 2 (STAB10-A) e, em recorte separado, STAB10-A-R1.**
