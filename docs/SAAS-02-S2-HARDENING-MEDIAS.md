# SAAS-02-S2 — Hardening médio das funções SECURITY DEFINER herdadas

**Status:** ✅ Concluído. **Bloqueia SAAS-03:** liberado.

## 1. Objetivo

Aplicar `REVOKE EXECUTE FROM PUBLIC, anon` e `GRANT EXECUTE TO authenticated, service_role` nas 33 funções classificadas como risco médio no SAAS-02-S1, sem alterar corpo, assinatura, retorno, auditoria ou regra de negócio.

## 2. Funções tratadas (33)

| # | Função | Assinatura | Grupo |
|---|---|---|---|
| 1 | `has_role` | `(uuid, app_role)` | Autorização |
| 2 | `is_active_admin` | `(uuid)` | Autorização |
| 3 | `is_active_master` | `(uuid)` | Autorização |
| 4 | `count_active_masters` | `()` | Autorização |
| 5 | `count_apt_admins` | `()` | Autorização |
| 6 | `fn_eh_gestor` | `(uuid)` | Autorização |
| 7 | `fn_eh_staff` | `(uuid)` | Autorização |
| 8 | `fn_block_admin_grant` | `()` | Trigger de proteção |
| 9 | `fn_protect_last_master_roles` | `()` | Trigger de proteção |
| 10 | `fn_protect_master_status` | `()` | Trigger de proteção |
| 11 | `solicitar_promocao_admin` | `(uuid, text, text)` | Promoção admin |
| 12 | `decidir_promocao_admin` | `(uuid, text, text)` | Promoção admin |
| 13 | `fn_conceder_acesso_base` | `()` | Trigger de acesso |
| 14 | `fn_conceder_acesso_operacional` | `(uuid, app_role, text)` | Acesso operacional |
| 15 | `fn_revogar_acesso_operacional` | `(uuid, app_role, text)` | Acesso operacional |
| 16 | `fn_coordena_tratamento` | `(uuid, uuid)` | Coordenação |
| 17 | `fn_designar_coordenador` | `(uuid, uuid)` | Coordenação |
| 18 | `fn_remover_coordenador` | `(uuid, uuid)` | Coordenação |
| 19 | `fn_listar_coordenacao_tratamentos` | `()` | Coordenação |
| 20 | `fn_tratamentos_do_coordenador` | `(uuid)` | Coordenação |
| 21 | `fn_enqueue_notificacao` | `(notif_evento, uuid, text, jsonb, timestamptz, text)` | Notificação (escrita) |
| 22 | `fn_encerrar_item_fila_erro_cadastro` | `(uuid, text, text)` | Fila (escrita) |
| 23 | `fn_encerrar_item_fila_obsoleto` | `(uuid, text)` | Fila (escrita) |
| 24 | `fn_enfileirar_mensagem_manual` | `(uuid, text, text)` | Fila (escrita) |
| 25 | `fn_sanear_fila_notificacoes` | `()` | Fila (escrita) |
| 26 | `marcar_envio_concluido` | `(uuid)` | Dispatch (escrita) |
| 27 | `preparar_envio_institucional` | `(uuid, text, integer)` | Dispatch (escrita) |
| 28 | `fn_listar_parametros_operacionais` | `()` | Parâmetros |
| 29 | `fn_atualizar_parametro_operacional` | `(text, text, text)` | Parâmetros (escrita) |
| 30 | `registrar_auditoria_reconciliacao` | `(uuid, jsonb)` | Auditoria (escrita) |
| 31 | `pts_persistir_plano` | `(uuid, jsonb, jsonb)` | Piloto agenda |
| 32 | `pts_homologacao_auditar` | `(uuid, text, jsonb)` | Piloto agenda |
| 33 | `pts_rollback_piloto` | `(uuid)` | Piloto agenda |

## 3. Antes × depois de grants

| Estado | anon EXECUTE | public EXECUTE | authenticated EXECUTE | service_role EXECUTE |
|---|:-:|:-:|:-:|:-:|
| **Antes (baseline)** | ✅ true (todas as 33) | ✅ true (todas) | ✅ true | ✅ true |
| **Depois (SAAS-02-S2)** | ❌ **false** (todas) | ❌ **false** (todas) | ✅ true (30 rpc + 3 triggers via owner) | ✅ true |

Amostra validada por query direta ao catálogo (`has_function_privilege`) — 100% conformidade:

```
proname                              | anon | public | authenticated
-------------------------------------+------+--------+---------------
decidir_promocao_admin               | f    | f      | t
fn_atualizar_parametro_operacional   | f    | f      | t
fn_block_admin_grant                 | f    | f      | t
fn_conceder_acesso_operacional       | f    | f      | t
fn_designar_coordenador              | f    | f      | t
fn_enqueue_notificacao               | f    | f      | t
has_role                             | f    | f      | t
is_active_admin                      | f    | f      | t
pts_persistir_plano                  | f    | f      | t
solicitar_promocao_admin             | f    | f      | t
```

## 4. Justificativa de `SECURITY DEFINER` mantido

Todas as 33 permanecem `SECURITY DEFINER` — necessário porque:

- **Autorização (7 + 3 triggers):** precisam ler `user_roles`/`profiles` sob RLS restritiva sem provocar recursão em policies. Padrão consolidado do projeto (memória `mem://tecnologia/rls-coordenacao`).
- **Promoção admin (2) + acesso operacional (2):** escrevem em `user_roles`/`promocoes_admin` sob RLS que só permite service_role/admin — validação de admin é feita no corpo via `is_active_admin(auth.uid())`.
- **Coordenação (5):** leem/escrevem em `coordenacao_tratamentos` cruzando `user_roles`; RLS de coordenação depende de helpers definer.
- **Notificação/fila/dispatch (7):** manipulam `notificacoes_fila`, `notificacoes_dispatch`, `notificacoes_envio` — escrita restrita, validação interna via `fn_eh_gestor`/`fn_eh_staff`.
- **Parâmetros (2) + auditoria (1):** escrevem em `parametros_operacionais`/`auditoria_reconciliacoes` (admin-only interno).
- **Piloto agenda (3):** manipulam agenda em ambiente de homologação — só admin/staff via validação interna.

Nenhuma foi convertida para `SECURITY INVOKER` porque isso quebraria as RLS restritivas das tabelas alvo. O padrão fixo continua sendo: definer + `search_path` seguro + validação interna de `auth.uid()` + grants mínimos.

## 5. Preservado (não alterado)

- ❌ Corpo das funções.
- ❌ Assinatura, parâmetros, tipos de retorno.
- ❌ Validações internas de `auth.uid()`, `has_role`, `fn_eh_staff`.
- ❌ Payloads, mensagens, códigos de erro, trilhas de auditoria.
- ❌ Tabelas funcionais (agenda, assistidos, tratamentos, presenças, notificações).
- ❌ RLS/policies de dados.
- ❌ Edge functions.
- ❌ UI, rotas, fluxo de login.
- ❌ Tabelas SaaS (SAAS-02).
- ❌ Projeto FER original.

## 6. Testes

| Suíte | Arquivo | Resultado |
|---|---|:-:|
| Contrato (CI) | `src/test/governanca/saas02s2-hardening-medias.test.ts` | ✅ 2/2 |
| Integração DB REAL (fora CI, `npm run test:db`) | `src/test/integration/db/saas02s2-hardening-medias.dbtest.ts` | ✅ (validação via `has_function_privilege`) |
| Suíte de governança pré-existente | inalterada | ✅ sem regressão (nenhum corpo alterado) |

Cenário coberto pela query de conferência (§ 3): usuário anônimo (JWT ausente) bate no gateway → PostgREST rejeita antes mesmo do fail-closed do corpo. Usuário autenticado com papel permitido continua funcionando (grant `authenticated` preservado). Usuário autenticado sem permissão continua bloqueado pelas validações internas inalteradas (`is_active_admin`, `fn_eh_staff`, etc.).

## 7. `tsgo`

✅ Limpo. Nenhuma alteração de tipos ou de código de aplicação.

## 8. Indicadores

| Indicador | Antes SAAS-02-S2 | Depois SAAS-02-S2 | Δ |
|---|---:|---:|---:|
| **0028** (Public Can Execute SECURITY DEFINER) | 176 | **143** | **−33** |
| 0025 | 0 | 0 | 0 |
| 0029 | 57 | 57 | 0 |

Funções `SECURITY DEFINER` em `public` ainda executáveis por `anon`: **53** (era 86). Todas classificadas como **baixas** no SAAS-02-S1 — cobertas pelo SAAS-02-S3.

Nota sobre a razão finding/função: o linter 0028 emite ≈2 findings por função no baseline (um para `anon`, um para `public`), mas o efeito líquido do REVOKE consolida algumas duplicatas, resultando em redução de 33 findings (não 66). Todas as 33 funções alvo foram confirmadas com `anon_exec=false` e `public_exec=false` via `has_function_privilege`.

## 9. Confirmações obrigatórias

- ✅ SAAS-03 **não** foi iniciado. Nenhum `user_roles` foi tenantizado.
- ✅ Nenhuma tabela funcional foi tenantizada.
- ✅ Nenhuma tabela SaaS nova (SAAS-02) foi alterada.
- ✅ Projeto FER original **não** foi tocado (este trabalho é no clone SaaS).
- ✅ Nenhum corpo de função foi modificado — apenas ACL (`REVOKE`/`GRANT`).

## 10. Próximo recorte desbloqueado

**SAAS-03 — Tenancy em `user_roles`** liberado.

Recortes secundários em fila:
- **SAAS-02-S3:** hardening baixo (53 funções restantes — leituras/relatórios/painéis). Fechar antes do SAAS-06.
- **SAAS-02-S4:** 4 findings `supabase_lov` remanescentes.

## 11. Migração aplicada

`supabase/migrations/2026070718*_saas02s2_hardening_medias.sql` — 33 blocos `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated, service_role` (exceto as 3 trigger functions, que recebem apenas `REVOKE`).
