# SAAS-05-B — Tenantização estrutural das tabelas base do módulo Tratamentos

**Status:** ✅ Concluído (estrutural, sem RLS funcional).
**Data:** 2026-07-07
**Base:** `docs/SAAS-05-A-MATRIZ-TENANTIZACAO-TRATAMENTOS.md`
**Tenant inicial:** `instituicoes` (única linha existente do seed SAAS-02 — "Casa Espírita Demo").

---

## 1. Objetivo

Executar a **primeira etapa estrutural** da tenantização: adicionar `instituicao_id` (nullable), FK e índice nas tabelas **T-DIR base** (raízes funcionais) do módulo Tratamentos, com backfill idempotente para o tenant inicial. Nenhuma regra funcional, RLS, RPC, edge function, UI, template ou notificação foi alterada.

---

## 2. Tabelas alteradas (13)

Todas classificadas como **T-DIR** no SAAS-05-A e priorizadas por serem raízes funcionais (não herdam tenant de ninguém).

| # | Tabela | Classe (05-A) | Justificativa da inclusão nesta fase |
|---|--------|---------------|--------------------------------------|
| 1 | `assistidos` | T-DIR | Agregado raiz do módulo; toda a família assistencial herda dela. |
| 2 | `voluntarios` | T-DIR | Vínculo trabalhador-instituição; base para escala e presença. |
| 3 | `palestras` | T-DIR | Programação pública organizada por casa. |
| 4 | `sessoes_publicas` | T-DIR | Sessão pública é do calendário da casa. |
| 5 | `avisos_internos` | T-DIR | Aviso é publicado por uma instituição. |
| 6 | `campanhas` | T-DIR | Iniciativa institucional. |
| 7 | `eventos` | T-DIR | Iniciativa institucional. |
| 8 | `acao_social_alimentos` | T-DIR | Ação social é organizada pela casa. |
| 9 | `regras_operacionais` | T-DIR | Motor de regras por casa (INV atual). |
| 10 | `excecoes_operacionais` | T-DIR | Exceções operacionais são por casa. |
| 11 | `programacao_padrao` | T-DIR | Programação padrão semanal por casa. |
| 12 | `configuracoes_gerais` | T-DIR | Antes single-tenant; passa a 1 linha por instituição no SAAS-05-F. |
| 13 | `comunicacoes_institucionais` | T-DIR | Comunicação WhatsApp é por casa (LGPD). |

**Tabelas T-DIR já tenantizadas antes deste recorte (SAAS-02):**
`assinaturas`, `instituicao_usuarios`. Não foram tocadas.

---

## 3. Estratégia de backfill

- **Alvo único:** a instituição existente resultante do seed SAAS-02 (`SELECT id FROM public.instituicoes ORDER BY created_at LIMIT 1`), obtida em bloco `DO $$ ... $$`.
- **Fail-fast:** `RAISE EXCEPTION 'SAAS-05-B: nenhuma instituição encontrada para backfill'` se a tabela `instituicoes` estiver vazia — impede migration cega.
- **Idempotência:** `UPDATE ... WHERE instituicao_id IS NULL` — reexecutar a migration não sobrescreve vínculos existentes.
- **Volume backfilled neste ambiente:** 0 linhas (todas as tabelas T-DIR base estavam vazias — projeto SaaS ainda não recebeu dados operacionais).
- **Órfãos após backfill:** 0 (garantido por `UPDATE` sobre 100% das linhas nulas).

Nenhum dado real da FER original foi copiado. O projeto FER não foi acessado nem alterado.

---

## 4. Restrições aplicadas

Para cada tabela T-DIR base:

| Objeto | Convenção | Idempotência |
|--------|-----------|--------------|
| Coluna | `instituicao_id uuid` (nullable nesta fase) | `ADD COLUMN IF NOT EXISTS` |
| Foreign key | `<tabela>_instituicao_id_fkey` → `public.instituicoes(id)` | Checagem prévia em `pg_constraint` |
| Ação FK | `ON DELETE RESTRICT ON UPDATE CASCADE` | — |
| Índice | `idx_<tabela>_instituicao_id` (btree) | `CREATE INDEX IF NOT EXISTS` |
| Comentário | `COMMENT ON COLUMN public.assistidos.instituicao_id` (marcador de recorte) | — |

**NOT NULL não aplicado nesta fase** — cutover formal fica para o SAAS-05-F, quando a FER for migrada como tenant inicial e a validação de zero-órfãos for confirmada em todas as tabelas T-DIR + T-HER.

---

## 5. Tabelas propositalmente NÃO alteradas

Nenhuma alteração fora do escopo. Categorias intocadas neste recorte:

### 5.1 T-HER (herdam por relacionamento — SAAS-05-B lote 2 / futuro)
`assistido_tratamentos`, `agenda_tratamentos_assistido`, `presencas_tratamentos`, `presencas_palestras`, `entrevistas_fraternas`, `checkins_publicos`, `checkin_tentativas`, `orientacoes_assistido`, `plano_tratamento_sessoes`, `voluntario_funcoes`, `coordenacao_tratamento`, `comunicacoes_institucionais_envios`.

### 5.2 G-PAR (parametrização por instituição — recorte próprio futuro)
`tipos_tratamento`, `funcoes_voluntariado`, `notificacoes_templates`, `ia_biblioteca`, `ia_configuracoes`.

### 5.3 G-GLB (identidade global)
`profiles`, `user_roles`, `mfa_recovery_codes`, `platform_admins`, `modulos`, `planos`, `plano_modulos`.

### 5.4 A-ANA (aguardam decisão de produto)
`consentimentos_comunicacao`, `whatsapp_conversas`, `whatsapp_handoffs`.

### 5.5 Fundação SaaS (não pertence ao módulo Tratamentos)
`instituicoes`, `assinaturas`, `instituicao_usuarios` — já resolvidas no SAAS-02.

---

## 6. Não foi alterado neste recorte

- ❌ RLS/policies funcionais.
- ❌ RPCs / SECURITY DEFINER functions.
- ❌ Edge functions.
- ❌ Triggers.
- ❌ GRANTs (nenhum table novo criado).
- ❌ UI, hooks, services, relatórios.
- ❌ Check-in público, notificações, fila, templates, dispatcher.
- ❌ Dados reais da FER.
- ❌ Projeto FER original.
- ❌ SAAS-02-S3 (hardening baixo permanece no backlog).

---

## 7. Riscos remanescentes (endereçados em recortes futuros)

| Risco | Recorte destino |
|-------|-----------------|
| Isolamento efetivo ainda não é enforced por RLS — leituras hoje são liberais. | **SAAS-05-C** |
| RPCs `SECURITY DEFINER` continuam sem filtro por tenant. | **SAAS-05-E** |
| Frontend/services não propagam `instituicao_id`. | **SAAS-05-D** |
| Colunas nullable permitem inserts sem tenant enquanto o cutover não é feito. | **SAAS-05-F** (NOT NULL + validação zero-órfãos) |
| Tabelas T-HER continuam sem coluna direta; leituras cross-tenant via join possíveis. | **SAAS-05-B lote 2** ou incorporado em **05-C** via helper. |

---

## 8. Verificação estrutural (executada contra o banco)

```
✅ 13/13 tabelas T-DIR base receberam a coluna instituicao_id
✅ 13/13 tabelas com FK <tabela>_instituicao_id_fkey → instituicoes(id)
✅ 13/13 tabelas com índice idx_<tabela>_instituicao_id
✅ 0    registros órfãos (tabelas vazias; UPDATE cobriu 100% das nulas)
✅ 0    tabelas T-HER/G-PAR/G-GLB/A-ANA alteradas indevidamente
✅ 0    policies/functions/triggers alterados
✅ 0    GRANT/REVOKE emitidos
```

Testes automatizados: `src/test/governanca/saas05b-tenantizacao-estrutural.test.ts` (contratos estáticos sobre a migration, roda no CI sem banco).

---

## 9. Próximos recortes

| Recorte | Objetivo |
|---------|----------|
| **SAAS-05-C** | Helpers RLS (`current_instituicao_id()`, `has_role_in_instituicao()`) + policies multi-tenant em modo shadow. |
| **SAAS-05-D** | Frontend: propagar `InstituicaoContext` a todos os services/hooks + guard de rota. |
| **SAAS-05-E** | RPCs/edge functions recebem `p_instituicao_id` obrigatório. |
| **SAAS-05-F** | Migração FER → tenant inicial + NOT NULL + cutover de policies. |
| **SAAS-05-G** | Testes E2E multi-tenant + testes de vazamento cross-tenant. |
| **SAAS-05-H** | Validação final. |

Bloqueio cruzado registrado: **SAAS-02-S3** (hardening baixo) deve rodar antes de **SAAS-05-F**.

---

## 10. Indicadores finais

| Indicador | Antes | Depois | Δ |
|-----------|-------|--------|---|
| 0028 (`SECURITY DEFINER` executáveis por anon/public) | 143 | **143** | 0 |
| 0025 (findings críticos)                              | 0   | **0**   | 0 |
| 0029 (`SECURITY DEFINER` auditadas)                    | 56  | **56**  | 0 |

Nenhuma superfície de segurança foi tocada.

## 11. `tsgo`

Sem alterações em TypeScript neste recorte (migration + testes de contrato + doc). Testes de contrato passam por `vitest` no CI.

---

## 12. Critério de aceite

✅ 13 tabelas T-DIR base tenantizadas com FK + índice + backfill idempotente.
✅ Zero órfãos.
✅ Nenhuma alteração funcional, RLS, RPC, edge function, UI ou dado real.
✅ Nenhuma alteração no projeto FER original.
✅ Indicadores 0028/0025/0029 preservados.
✅ Testes de contrato verdes.

**Próximo recorte autorizado:** SAAS-05-C (RLS multi-tenant em modo shadow).
