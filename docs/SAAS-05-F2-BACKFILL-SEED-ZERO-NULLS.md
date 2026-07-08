# SAAS-05-F2 — Backfill defensivo, seed demo e validação zero nulls

Status: **ENCERRADO**. Sem cutover, sem NOT NULL, sem alteração de RLS/policies, sem toque em RPCs/edges/frontend, sem migração de dados reais e sem alterar o projeto FER original.

## 1. Migração criada

Arquivo: `supabase/migrations/20260708034755_f31c1d4c-f2d4-4ffd-8f41-df9cdf38f76a.sql`

Estrutura (bloco único idempotente `DO $saas05f2$`):

1. Resolve o tenant demo (`Casa Espírita Demo`, criado no SAAS-02) por
   nome; se ausente, aborta silenciosamente (no-op garantido).
2. **Backfill defensivo** nas 13 T-DIR:
   `UPDATE ... SET instituicao_id = <demo> WHERE instituicao_id IS NULL`.
   Idempotente por construção. Em sandbox limpo é no-op.
3. **Seed sintético mínimo** apenas em T-DIR sem FK obrigatória para
   `auth.users`:
   - `configuracoes_gerais(chave='saas05_f2_demo_marker', valor='seed')`
   - `comunicacoes_institucionais(titulo='SAAS-05-F2 · Comunicado Demo', status='rascunho')`
   - `palestras(data='2026-01-01', tema='SAAS-05-F2 · Palestra Demo')`
   Todos com `instituicao_id = <demo>` e guardados por `WHERE NOT EXISTS`
   sobre marcadores únicos → **reexecução não duplica**.

**Fora do seed nesta fase (motivo):**
- `assistidos` e `voluntarios` exigem `created_by uuid NOT NULL` referenciando um
  usuário real. Criar seed com `auth.users` fictício violaria a integridade
  do Auth e o próprio escopo ("dados sintéticos, sem tocar em auth"). Ficará
  para SAAS-05-G, junto com fixtures de usuário demo.

## 2. Backfill aplicado

Resultado observado: **no-op** (todas as 13 T-DIR estavam com 0 linhas antes
do seed). A migração fica registrada como *guarda idempotente* para
qualquer ambiente que já tenha legado — o SaaS de produção passará por ela
sem risco.

## 3. Seed demo criado (dados sintéticos)

Verificação viva pós-migração:

| Tabela | Registros seed | Nulls | Tenant |
| --- | :---: | :---: | --- |
| `configuracoes_gerais` (`chave='saas05_f2_demo_marker'`) | 1 | 0 | demo |
| `comunicacoes_institucionais` (`titulo='SAAS-05-F2 · Comunicado Demo'`) | 1 | 0 | demo |
| `palestras` (`tema='SAAS-05-F2 · Palestra Demo'`) | 1 | 0 | demo |

Todos os registros são **sintéticos, sem dados pessoais**, sem qualquer
dado real da FER.

## 4. Validação zero nulls (13 T-DIR)

Query consolidada executada pós-migração:

```
total_nulls_t_dir = 0
```

Detalhe: cada uma das 13 T-DIR retorna
`count(*) FILTER (WHERE instituicao_id IS NULL) = 0`.

## 5. Validação zero órfãos e zero cross-tenant (10 T-HER)

As 10 T-HER (`assistido_tratamentos`, `agenda_tratamentos_assistido`,
`plano_tratamento_sessoes`, `presencas_tratamentos`, `checkins_publicos`,
`avisos_ausencia`, `notificacoes_fila`, `notificacoes_log`,
`whatsapp_conversas`, `whatsapp_handoffs`) permanecem vazias.

- **Órfãos:** 0.
- **Cross-tenant real:** 0.
- **Herança segura via T-DIR pai:** confirmada no F1; nenhuma T-HER precisa
  de `instituicao_id` direto neste momento — o join com a T-DIR pai é
  suficiente. A decisão de adicionar `instituicao_id` direto em T-HER (para
  índices/leituras rápidas) fica documentada como **opcional, avaliada em
  SAAS-05-G**.

## 6. Auditoria de criação sem tenant

- **Sem trigger bloqueante nesta fase** (fora do escopo — poderia mascarar
  bugs de resolução de tenant e antecipar cutover).
- Cobertura via governança: a suíte
  `src/test/governanca/saas05f2-backfill-seed-zero-nulls.test.ts`
  garante o contrato do arquivo de migração; a query zero-nulls fica
  documentada aqui e será promovida a assert de banco em SAAS-05-G quando
  os testes de integração real de DB (fora do sandbox BYPASSRLS) forem
  executados.

## 7. Alerta "Segurança 2"

O scanner após a migração retornou **116 warnings herdados**, todos da
categoria `0029_authenticated_security_definer_function_executable`
(Signed-In Users Can Execute SECURITY DEFINER Function). Classificação:

- **Origem:** funções `SECURITY DEFINER` do baseline pré-SaaS + overloads
  tenant-aware criados nos recortes E1..E4/A2. Já foram tratadas em
  SAAS-02-S2/S3 com `REVOKE FROM PUBLIC, anon` + `GRANT TO authenticated,
  service_role`. O warning 0029 sinaliza "usuário autenticado pode
  executar" — o que é **intencional e necessário** (as RPCs precisam ser
  chamáveis pelo app autenticado; a segurança real vem de validação
  interna de papel/tenant dentro da função).
- **Relação com SAAS-02-S4:** não são os findings `supabase_lov` F1/F2/F3
  (esses são de RLS/policy, tratados em F3). São o linter genérico do
  Supabase.
- **Ação neste F2:** nenhuma. Correção fora do escopo. Encaminhado para
  **SAAS-05-F3 / SAAS-02-S5 (opcional)** — só serão endurecidos se a
  análise concluir que uma função específica não deveria estar acessível a
  autenticados. A maioria permanecerá como está por design.

## 8. Riscos remanescentes para F3

| Risco | Severidade | Nota |
| --- | --- | --- |
| Policies `has_role`-only ainda ativas (findings F1/F2/F3) | Alta | Objeto do F3. |
| Fluxo criar linha sem `instituicao_id` após NOT NULL | Média | F3 aplica NOT NULL só após CI zero-nulls verde por ≥ 1 ensaio. |
| Fallbacks residuais em `central-fila-alerta`, `whatsapp-inbound`, `alertas-operacionais` | Média | Remoção controlada no F3. |
| Warnings 0029 (linter Supabase) | Baixa | Design; endurecimento pontual, se necessário, no F3. |

## 9. Recomendação para SAAS-05-F3

**Apto para prosseguir com F3.** Pré-condições satisfeitas:

1. Backfill idempotente disponível ✅
2. Seed sintético no tenant demo ✅
3. Zero nulls nas 13 T-DIR ✅
4. Zero órfãos e zero cross-tenant nas 10 T-HER ✅
5. Projeto FER original intocado ✅

## 10. Escopo preservado

- **Nenhum** `NOT NULL` aplicado.
- **Nenhuma** RLS/policy alterada.
- **Nenhuma** RPC/edge/frontend alterada.
- **Nenhuma** remoção de fallback single-tenant.
- **Nenhum** dado real da FER migrado.
- **Nenhum** tenant FER real criado.

## 11. Indicadores

- **0028:** +0
- **0025:** +0
- **0029:** +0 (warnings herdados; nenhuma função nova exposta por este recorte)

## 12. Delta isolado do F2

- 1 migração idempotente (backfill defensivo + seed demo mínimo).
- 3 registros sintéticos no tenant demo (`configuracoes_gerais`,
  `comunicacoes_institucionais`, `palestras`).
- 1 documento novo (este).
- 1 suíte nova de governança
  (`src/test/governanca/saas05f2-backfill-seed-zero-nulls.test.ts`).
- **0** policies, **0** NOT NULL, **0** edges, **0** RPCs, **0** frontend,
  **0** dados reais, **0** alteração no projeto FER original.
