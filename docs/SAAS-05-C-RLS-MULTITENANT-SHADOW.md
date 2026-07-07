# SAAS-05-C — Helpers RLS Multi-Tenant em Modo Shadow

**Status:** ✅ Concluído (helpers + policies shadow, sem restringir acesso atual).  
**Data:** 2026-07-07  
**Base:** `docs/SAAS-05-A-MATRIZ-TENANTIZACAO-TRATAMENTOS.md` e `docs/SAAS-05-B-TENANTIZACAO-ESTRUTURAL-TABELAS-BASE.md`

---

## 1. Objetivo

Criar a **camada de helpers de contexto de tenant** e as **policies multi-tenant em modo shadow** para as 13 tabelas T-DIR base do módulo Tratamentos.

Em modo **shadow**, as policies novas:
- coexistem com as policies atuais (legadas, single-tenant);
- são `PERMISSIVE`, portanto **não restringem** o acesso atual;
- executam a lógica final desejada de isolamento por tenant, servindo como
  “ensaio” para o cutover formal em **SAAS-05-F**.

---

## 2. Helpers criados

| Helper | Assinatura | Propósito | Implementação |
|--------|------------|-----------|---------------|
| `current_instituicao_id` | `() → uuid` | Retorna o tenant ativo do contexto de execução. | Lê `current_setting('app.current_instituicao', true)`. |
| `is_member_of_instituicao` | `(uuid, uuid) → boolean` | Padrão SAAS-05-A; verifica se usuário é membro ativo da instituição. | Wrapper de `public.user_pertence_instituicao` (SAAS-02). |
| `has_role_in_instituicao` | `(uuid, uuid, saas_papel_local) → boolean` | Padrão SAAS-05-A; verifica papel local ativo do usuário na instituição. | Wrapper de `public.user_tem_papel_local` (SAAS-02). |

**Decisão de segurança:** as três funções são **SQL STABLE** com `SET search_path = public`, mas **não são `SECURITY DEFINER`**, pois não acessam tabelas diretamente (`current_instituicao_id` lê uma variável de sessão; os wrappers invocam funções `SECURITY DEFINER` já existentes). Isso evita incrementar o indicador de superfícies privilegiadas (`0029`) sem necessidade.

---

## 3. Grants de segurança

Todas as funções novas têm:
- `REVOKE EXECUTE ... FROM PUBLIC, anon;`
- `GRANT EXECUTE ... TO authenticated, service_role;`

Isso mantém o padrão do projeto: nenhuma função de acesso fica exposta a anônimos.

---

## 4. Policies shadow multi-tenant

Para cada uma das 13 tabelas T-DIR base foi criada uma policy `PERMISSIVE` nomeada:

```
shadow_tenant_all_<tabela>
```

### 4.1 Tabelas cobertas (mesmas 13 do SAAS-05-B)

1. `assistidos`
2. `voluntarios`
3. `palestras`
4. `sessoes_publicas`
5. `avisos_internos`
6. `campanhas`
7. `eventos`
8. `acao_social_alimentos`
9. `regras_operacionais`
10. `excecoes_operacionais`
11. `programacao_padrao`
12. `configuracoes_gerais`
13. `comunicacoes_institucionais`

### 4.2 Lógica da policy shadow

```sql
USING (
  public.is_platform_admin(auth.uid())
  OR (
    public.current_instituicao_id() IS NOT NULL
    AND instituicao_id = public.current_instituicao_id()
    AND public.is_member_of_instituicao(auth.uid(), instituicao_id)
  )
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR (
    public.current_instituicao_id() IS NOT NULL
    AND instituicao_id = public.current_instituicao_id()
    AND public.is_member_of_instituicao(auth.uid(), instituicao_id)
  )
)
```

**Significado:**
- `platform_admin` continua com bypass universal (igual ao SAAS-02).
- Para usuários comuns, a policy só concede acesso se:
  1. um tenant estiver ativo no contexto (`app.current_instituicao`);
  2. o registro pertencer àquele tenant (`instituicao_id`);
  3. o usuário for membro ativo daquela instituição.

Como a policy é **permissiva**, a negação acima não bloqueia nada hoje: as policies legadas continuam concedendo acesso normalmente. A shadow será ativada em **SAAS-05-F** (conversão para `RESTRICTIVE` ou substituição das legadas).

### 4.3 Idempotência

Cada policy é criada com:

```sql
DROP POLICY IF EXISTS "shadow_tenant_all_<tabela>" ON public.<tabela>;
CREATE POLICY "shadow_tenant_all_<tabela>" ...;
```

Reexecutar a migration é seguro e não cria duplicatas.

---

## 5. O que NÃO foi alterado neste recorte

- ❌ Policies legadas (nenhuma `ALTER POLICY` / `DROP POLICY` fora das shadow).
- ❌ Estado de RLS (`ENABLE/DISABLE ROW LEVEL SECURITY`).
- ❌ NOT NULL em `instituicao_id` (cutover = SAAS-05-F).
- ❌ Tabelas T-HER / G-PAR / G-GLB / A-ANA (sem policies shadow nesta fase).
- ❌ RPCs, edge functions, triggers, services, hooks, UI, relatórios.
- ❌ Dados reais da FER ou do tenant demo.
- ❌ Projeto FER original.
- ❌ SAAS-02-S3 (hardening baixo permanece no backlog).

---

## 6. Riscos endereçados

| Risco | Mitigação neste recorte |
|-------|-------------------------|
| R-04 — Usuário em múltiplas instituições vê dados errados | Helpers e policies shadow já enxergam `current_instituicao_id()` + membership. |
| R-10 — Vazamento via views/materialized views legadas | Mapeado para recorte futuro; helpers estão disponíveis para reescrita segura. |
| R-12 — Platform_admin com bypass amplo demais | Bypass explícito apenas em policies shadow; escrita ainda dependerá de `p_instituicao_id` em RPCs. |

---

## 7. Verificação estrutural (executada contra o banco)

```
✅ 3/3 helpers criados (current_instituicao_id, is_member_of_instituicao, has_role_in_instituicao)
✅ 0 novas funções SECURITY DEFINER
✅ 13/13 tabelas T-DIR base com policy shadow permissiva
✅ 0 policies legadas alteradas ou removidas
✅ 0 tabelas T-HER/G-PAR/G-GLB/A-ANA receberam policy shadow
✅ Grants corretos: revogado PUBLIC/anon, concedido authenticated/service_role
```

Testes automatizados: `src/test/governanca/saas05c-rls-multitenant-shadow.test.ts` (contratos estáticos sobre a migration, roda no CI sem banco).

---

## 8. Próximos recortes

| Recorte | Objetivo |
|---------|----------|
| **SAAS-05-D** | Propagar `InstituicaoContext` a todos os services/hooks e criar guard `RequireInstituicao`. |
| **SAAS-05-E** | RPCs/edge functions recebem `p_instituicao_id` obrigatório; loops por tenant no cron. |
| **SAAS-05-F** | Migração FER → tenant inicial + NOT NULL + cutover das policies legadas → shadow. |
| **SAAS-05-G** | Testes E2E multi-tenant + testes de vazamento cross-tenant. |
| **SAAS-05-H** | Validação final. |

Bloqueio cruzado registrado: **SAAS-02-S3** (hardening baixo) deve rodar antes de **SAAS-05-F**.

---

## 9. Indicadores finais

| Indicador | Antes | Depois | Δ |
|-----------|-------|--------|---|
| 0028 (`SECURITY DEFINER` executáveis por anon/public) | 143 | **143** | 0 |
| 0025 (findings críticos) | 0 | **0** | 0 |
| 0029 (`SECURITY DEFINER` auditadas) | 56 | **56** | 0 |

Nenhuma superfície de segurança nova foi criada (os helpers são SQL invoker ou wrappers de funções já existentes).

---

## 10. `tsgo`

Sem alterações em TypeScript produtivo neste recorte (migration + testes de contrato + doc). Testes de contrato passam por `vitest` no CI.

---

## 11. Critério de aceite

✅ Helpers de tenant criados e documentados.  
✅ Policies shadow `PERMISSIVE` nas 13 tabelas T-DIR base.  
✅ Lógica shadow verifica tenant ativo + membership + bypass platform_admin.  
✅ Policies legadas inalteradas; RLS estado inalterado; NOT NULL não aplicado.  
✅ Nenhuma função `SECURITY DEFINER` nova.  
✅ Indicadores 0028/0025/0029 preservados.  
✅ Testes de contrato verdes.  

**Próximo recorte autorizado:** SAAS-05-D (frontend propagation + guard de rota).
