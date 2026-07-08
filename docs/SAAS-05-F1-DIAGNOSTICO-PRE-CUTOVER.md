# SAAS-05-F1 — Diagnóstico pré-cutover e plano de virada multi-tenant

Status: **ENCERRADO** (diagnóstico e planejamento; sem cutover, sem alteração de RLS/policies, sem NOT NULL, sem remoção de fallbacks, sem migração de dados reais).

## 1. Base documental consultada

- `docs/SAAS-05-A-MATRIZ-TENANTIZACAO-TRATAMENTOS.md`
- `docs/SAAS-05-B-TENANTIZACAO-ESTRUTURAL-TABELAS-BASE.md`
- `docs/SAAS-05-C-RLS-MULTITENANT-SHADOW.md`
- `docs/SAAS-05-D-PROPAGACAO-TENANT-FRONTEND.md`
- `docs/SAAS-05-E1-RPCS-TENANT-AWARE-INTERNAS.md`
- `docs/SAAS-05-E2-RPCS-TENANT-AWARE-ASSISTIDOS-AGENDA-TRATAMENTOS.md`
- `docs/SAAS-05-E3-RPCS-TENANT-AWARE-ENTREVISTAS-AVISOS.md`
- `docs/SAAS-05-E4-RPCS-TENANT-AWARE-RELATORIOS-DASHBOARDS-IA.md`
- `docs/SAAS-05-E-EDGE-A-CHECKIN-ALERTAS-FILA.md`
- `docs/SAAS-05-E-EDGE-A2-RPCS-FILA-COMUNICADORES.md`
- `docs/SAAS-05-E-EDGE-B-DISPATCHERS-TENANT-AWARE.md`
- `docs/SAAS-05-E-EDGE-C-WHATSAPP-TENANT-AWARE.md`
- `docs/SAAS-05-E-EDGE-D-IA-TENANT-AWARE.md`
- `docs/SAAS-02-S3-HARDENING-BAIXAS.md`
- `docs/SAAS-02-S4-FINDINGS-SUPABASE-LOV.md`

## 2. Diagnóstico das 13 tabelas T-DIR

Inspeção viva no banco (sandbox multi-tenant, projeto FER original intocado):

| Tabela                       | tem `instituicao_id` | total | nulls | tenants distintos |
| ---------------------------- | :---: | :---: | :---: | :---: |
| assistidos                   | ✅ | 0 | 0 | 0 |
| voluntarios                  | ✅ | 0 | 0 | 0 |
| palestras                    | ✅ | 0 | 0 | 0 |
| sessoes_publicas             | ✅ | 0 | 0 | 0 |
| avisos_internos              | ✅ | 0 | 0 | 0 |
| campanhas                    | ✅ | 0 | 0 | 0 |
| eventos                      | ✅ | 0 | 0 | 0 |
| acao_social_alimentos        | ✅ | 0 | 0 | 0 |
| regras_operacionais          | ✅ | 0 | 0 | 0 |
| excecoes_operacionais        | ✅ | 0 | 0 | 0 |
| programacao_padrao           | ✅ | 0 | 0 | 0 |
| configuracoes_gerais         | ✅ | 0 | 0 | 0 |
| comunicacoes_institucionais  | ✅ | 0 | 0 | 0 |

**Leitura:** as 13 T-DIR já expõem a coluna (SAAS-05-B). No sandbox SaaS não há
dados reais — o cenário é ideal para ensaio de `NOT NULL` sem risco de
backfill destrutivo. Bloqueadores de dados: **nenhum** neste sandbox. O único
tenant existente é a Casa Espírita **Demo**
(`c0ed0316-94ce-4b21-83bb-ab36a86a8ded`, criado 2026-07-07), reservado para
ensaios do cutover.

## 3. Diagnóstico das tabelas T-HER

Tabelas herdeiras existentes no schema:

| Tabela                        | tem `instituicao_id` direto | pai T-DIR | total |
| ----------------------------- | :---: | --- | :---: |
| assistido_tratamentos         | ❌ | `assistidos` | 0 |
| agenda_tratamentos_assistido  | ❌ | `assistidos` | 0 |
| plano_tratamento_sessoes      | ❌ | `assistidos` (via `assistido_tratamentos`) | 0 |
| presencas_tratamentos         | ❌ | `assistidos` | 0 |
| checkins_publicos             | ❌ | `sessoes_publicas` | 0 |
| avisos_ausencia               | ❌ | `assistidos` | 0 |
| notificacoes_fila             | ❌ | `assistidos` | 0 |
| notificacoes_log              | ❌ | `assistidos` | 0 |
| whatsapp_conversas            | ❌ | `assistidos` | 0 |
| whatsapp_handoffs             | ❌ | `assistidos` (via `whatsapp_conversas`) | 0 |

Tabelas listadas no recorte que **não existem** neste schema (não requerem
ação em F2/F3): `entrevistas`, `tratamentos`, `tratamentos_modalidades`. As
entrevistas são representadas dentro de `agenda_tratamentos_assistido` /
funções específicas — herdam tenant via assistido.

Join de herança: seguro em todas as T-HER, pois todas encadeiam para uma
T-DIR já tenantizada (`assistidos` ou `sessoes_publicas`). Não há tabelas
órfãs sem raiz. Sem dados, **cross-tenant potencial = 0**.

## 4. Mapa de nulls, órfãos e cross-tenant

- **Nulls em T-DIR:** 0/0 em todas as 13 tabelas.
- **Órfãos em T-HER:** 0 (todas as T-HER estão vazias).
- **Cross-tenant real:** 0 registros.
- **Cross-tenant potencial via policies:** 3 findings do S4 (F1/F2/F3),
  ver §5.

## 5. Inventário de policies/RLS para cutover

Contagem viva por T-DIR (`pg_policies`):

| Tabela | shadow_tenant_all_* | legadas | total |
| --- | :---: | :---: | :---: |
| assistidos | 1 | 6 | 7 |
| voluntarios | 1 | 1 | 2 |
| avisos_internos | 1 | 6 | 7 |
| campanhas | 1 | 4 | 5 |
| eventos | 1 | 4 | 5 |
| acao_social_alimentos | 1 | 4 | 5 |
| comunicacoes_institucionais | 1 | 4 | 5 |
| excecoes_operacionais | 1 | 4 | 5 |
| programacao_padrao | 1 | 4 | 5 |
| sessoes_publicas | 1 | 3 | 4 |
| palestras | 1 | 2 | 3 |
| regras_operacionais | 1 | 2 | 3 |
| configuracoes_gerais | 1 | 2 | 3 |

**Todas as 13 T-DIR** têm exatamente 1 policy `shadow_tenant_all_*` ativa +
`N` policies legadas OR-combinadas. Este é exatamente o padrão descrito nos
findings F1/F2/F3 do SAAS-02-S4.

### Mapeamento S4 → F3

| Finding S4 | Tabela(s) | Ação em F3 |
| --- | --- | --- |
| F1 `assistidos_voluntarios_pii_cross_tenant` | `assistidos`, `voluntarios` | Endurecer/remover policies `has_role`-only; manter apenas shadow (+ filtro tenant). |
| F2 `comunicacoes_institucionais_admin_unscoped` | `comunicacoes_institucionais` | Restringir policies admin com `instituicao_id = current_instituicao_id()`. |
| F3 `role_based_policies_bypass_tenant_scoping` | 17 tabelas listadas no scanner (superset das 13 T-DIR + T-HER) | Substituir policies OR-combinadas por versões tenant-scoped ou removê-las quando `shadow_tenant_all_*` já cobrir integralmente. |

Neste recorte **nenhuma policy foi alterada**.

## 6. Inventário de RPCs (tenant-aware vs legadas)

Overloads verificados via `pg_proc`. Amostra representativa:

| Função | Legada | Tenant-aware |
| --- | :---: | :---: |
| `fila_humana_pendente` | ✅ (sem args) | ✅ `(p_instituicao_id uuid)` |
| `comunicadores_elegiveis` | ✅ | ✅ `(p_instituicao_id uuid)` |
| `dashboard_admin` | ✅ `(p_inicio,p_fim)` | ✅ `(p_inicio,p_fim,p_instituicao_id)` |
| `fn_entrevistas_operacional` | ✅ | ✅ `(...,p_instituicao_id)` |
| `fn_observabilidade_operacional` | ✅ `(p_janela)` | ✅ `(p_janela,p_instituicao_id)` |
| `fn_avisos_ausencia_pendentes` | ✅ `(p_incluir_resolvidos)` | ✅ `(...,p_instituicao_id)` |
| `contar_publico_elegivel` | ✅ `(p_versao)` | ❌ (não requer — depende só de `sessoes_publicas`; ver F2/F3) |

Padrão consolidado em SAAS-05-E1/E2/E3/E4 + EDGE-A2:
- Overload tenant-aware criado com `p_instituicao_id uuid`;
- `REVOKE ... FROM PUBLIC, anon` e `GRANT ... TO authenticated, service_role`;
- Legada preservada para retrocompatibilidade single-tenant.

**Plano de depreciação:**
- **F2:** identificar consumidores restantes das legadas (frontend, cron,
  service_role, edges).
- **F3:** para cada legada com 0 chamadas restantes, aplicar
  `REVOKE EXECUTE` de `authenticated` (mantém `service_role` como escape).
- **G:** confirmar via testes E2E que nenhum fluxo real depende de legada.
- **H:** DROP definitivo somente quando piloto FER estiver estável.

## 7. Inventário de fallbacks single-tenant em edges

19 edge functions ao total; 11 já leem `instituicao_id`/`p_instituicao_id`.
`rg` detectou padrões de fallback (`IS NULL`, `single-tenant`, `fallback`)
em 3 arquivos:

| Edge | Ocorrências | Situação |
| --- | :---: | --- |
| `central-fila-alerta` | 2 | Fallback intencional pós EDGE-A/A2 para tenant ausente em jobs legados; remover em F3. |
| `whatsapp-inbound` | 13 | Casos: telefone único, tenant único, fail-closed em ambíguo (EDGE-C). Manter fail-closed; remover apenas fallback "tenant único" em F3. |
| `alertas-operacionais` | 4 | Fallback single-tenant ainda tolerado (EDGE-A). Remover em F3 quando piloto FER estiver ativo. |

Demais edges tenant-aware (`checkin-publico`, `notificacoes-dispatch`,
`comunicacao-dispatch`, `whatsapp-responder`, `assistente-entrevista`,
`insights-dashboard`, `ia-site-ingestao`, `conteudo-imagem-ia`) já operam
sem fallback destrutivo.

## 8. Readiness para NOT NULL nas T-DIR

| Tabela | Nulls | Bloqueadores | Backfill | Risco NOT NULL |
| --- | :---: | --- | --- | --- |
| Todas as 13 T-DIR | 0 | Nenhum de dados | Não necessário (sandbox vazio) | Baixo |

Bloqueadores **não relacionados a dados**:
1. Fluxos que criam linhas sem `instituicao_id` (ex.: seed inicial de
   `configuracoes_gerais`, criação pública em `checkins_publicos`) devem
   ser auditados em F2 — hoje eles usam `current_instituicao_id()` ou
   `resolve_tenant_from_slug()`, mas isso precisa ser confirmado com o
   tenant demo antes do NOT NULL.
2. `configuracoes_gerais` historicamente era single-row global; em F2
   validar unicidade `(instituicao_id)` antes de aplicar NOT NULL.

**Readiness geral:** ✅ apto para F2 (backfill + ensaio) → F3 (NOT NULL).

## 9. Tenant inicial / casa demo

- **Casa Espírita Demo** existe (id
  `c0ed0316-94ce-4b21-83bb-ab36a86a8ded`, criada em SAAS-02).
- Dados sintéticos: ausentes neste momento; devem ser semeados em F2 para
  ensaio de escrita.
- **Projeto FER original: intocado.** Nenhuma migração deste recorte lê ou
  altera o projeto FER.
- **Nenhum dado real** de assistidos/voluntários da FER foi migrado.

## 10. Plano de cutover em fases

### SAAS-05-F2 — Saneamento & ensaio (não destrutivo)
- Backfill defensivo: SQL idempotente `UPDATE ... SET instituicao_id = <demo>
  WHERE instituicao_id IS NULL` para as 13 T-DIR.
- Auditoria de criação de linhas sem tenant em fluxos:
  `configuracoes_gerais`, `checkins_publicos` (via `resolve_tenant_from_slug`),
  `avisos_internos`, `notificacoes_fila`.
- Ensaio de "zero nulls" em CI (query de guarda).
- Semeadura sintética no tenant demo para exercitar todos os fluxos.
- Sem NOT NULL, sem remoção de policy, sem cutover.

### SAAS-05-F3 — Endurecimento & virada
- Reescrita/remoção das policies `has_role`-only OR-combinadas
  (findings F1/F2/F3 do S4).
- Aplicação de `ALTER COLUMN instituicao_id SET NOT NULL` nas 13 T-DIR.
- Remoção dos fallbacks single-tenant residuais em
  `central-fila-alerta`, `whatsapp-inbound`, `alertas-operacionais`.
- Depreciação controlada de RPCs legadas sem consumidores.

### SAAS-05-G — Testes E2E multi-tenant
- Cenário duplo-tenant (Demo + Piloto): isolamento total de PII, fila,
  WhatsApp, IA, dashboards.
- Regressão de fluxos críticos: check-in público, agenda, entrevistas,
  comunicação, campanhas, ação social.
- Testes de RLS por linha (fora do sandbox BYPASSRLS).

### SAAS-05-H — Preparação de piloto / tenant FER SaaS
- Criação de tenant FER **no SaaS** (não no projeto FER original).
- Import controlado e auditado dos dados FER apenas mediante autorização
  explícita.
- Monitoramento intensivo + rollback plan.

## 11. Riscos & bloqueadores

| Risco | Severidade | Mitigação |
| --- | --- | --- |
| Policy legada permitir cross-tenant após semeadura demo | Alta | F3 remove/endurece antes de dados reais. |
| Fluxo criar linha sem `instituicao_id` após NOT NULL | Média | F2 audita e F3 aplica NOT NULL só após CI verde. |
| Consumidor esquecido de RPC legada | Média | F2 varre chamadas; F3 revoga incrementalmente. |
| Regressão em check-in público | Alta | `resolve_tenant_from_slug` já cobre; F2 valida com tenant demo. |
| WhatsApp com número compartilhado entre tenants | Alta | Fail-closed EDGE-C já ativo; F3 remove fallback "tenant único". |

## 12. Recomendação final

**Apto para prosseguir com SAAS-05-F2.**

O sandbox SaaS está limpo (0 nulls, 0 órfãos, 0 cross-tenant real). As
camadas D/E/E-EDGE já entregam operação tenant-aware ponta-a-ponta. A
única frente estrutural remanescente é a **remoção das policies legadas
OR-combinadas + NOT NULL**, planejada para F3, após o saneamento defensivo
de F2. O projeto FER original permanece intocado e só será tocado, se for
autorizado, em SAAS-05-H.

## 13. Indicadores

- **0028:** +0
- **0025:** +0
- **0029:** +0

## 14. Delta isolado do F1

- 1 documento novo (este).
- 1 suíte nova: `src/test/governanca/saas05f1-diagnostico-pre-cutover.test.ts`.
- **0** migrações, **0** policies, **0** NOT NULL, **0** edges alteradas,
  **0** RPCs alteradas, **0** frontend/serviço, **0** dados reais, **0**
  alteração no projeto FER original.
