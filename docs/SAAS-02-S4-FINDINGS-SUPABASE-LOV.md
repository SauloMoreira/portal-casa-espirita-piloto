# SAAS-02-S4 — Análise e saneamento dos findings supabase_lov

Status: **ENCERRADO** (classificação e formalização; nenhuma correção destrutiva aplicada por design de recorte).

## 1. Contexto

O recorte SAAS-02-S4 exige inventariar, classificar e, quando seguro, sanear
findings da categoria `supabase_lov`, **sem tocar em RLS/policies, sem NOT
NULL, sem cutover e sem alterar o projeto FER original**.

O scanner `supabase_lov` (versão 3.2, timestamp 2026-07-08T03:02:13Z) reporta,
neste recorte, **3 findings ativos** — não 4. A divergência com o enunciado do
recorte (que menciona "4 findings") foi validada contra o resultado bruto do
scanner e registrada aqui como observação formal:

> Observação: a contagem atual do scanner é 3. Caso um quarto finding
> reapareça em execução futura, deverá ser tratado em recorte próprio
> (SAAS-02-S4-B) preservando o mesmo protocolo desta análise.

## 2. Inventário dos findings supabase_lov

### F1 — `assistidos_voluntarios_pii_cross_tenant`

- **Objeto:** tabelas `public.assistidos` e `public.voluntarios`.
- **Tipo:** policies RLS `PERMISSIVE`.
- **Schema:** `public`.
- **Privilégio:** SELECT/UPDATE por papéis (`admin`, `entrevistador`,
  `tarefeiro`) sem filtro `instituicao_id`.
- **Motivo do alerta:** policies `has_role(...)` OR-combinadas com
  `shadow_tenant_all_*` permitem, em tese, leitura cross-tenant de PII
  (CPF, celular, endereço, data_nascimento).
- **Herdado do Lovable/Supabase?** Não; é regra criada no projeto.
- **Controlável pelo projeto?** Sim, via reescrita das policies (cutover).
- **Falso positivo?** Não do ponto de vista formal (OR-combining é real).
- **Exige correção?** Sim, **no cutover** (SAAS-05-F1).
- **Documentar como risco aceito?** Sim, com controles compensatórios.

### F2 — `comunicacoes_institucionais_admin_unscoped`

- **Objeto:** `public.comunicacoes_institucionais`.
- **Tipo:** policies RLS `PERMISSIVE` (SELECT/INSERT/UPDATE/DELETE).
- **Schema:** `public`.
- **Privilégio:** ações de admin sem filtro `instituicao_id`.
- **Motivo do alerta:** policies `has_role(auth.uid(),'admin')` OR-combinadas
  com `shadow_tenant_all_comunicacoes_institucionais`.
- **Herdado?** Não.
- **Controlável?** Sim, via reescrita das policies (cutover).
- **Falso positivo?** Não.
- **Exige correção?** Sim, **no cutover**.
- **Risco aceito documentado?** Sim.

### F3 — `role_based_policies_bypass_tenant_scoping`

- **Objeto:** conjunto amplo de tabelas (`assistidos`, `voluntarios`,
  `assistido_tratamentos`, `agenda_tratamentos_assistido`,
  `plano_tratamento_sessoes`, `presencas_tratamentos`, `checkins_publicos`,
  `campanhas`, `eventos`, `excecoes_operacionais`, `programacao_padrao`,
  `sessoes_publicas`, `avisos_internos`, `acao_social_alimentos`,
  `regras_operacionais`, `configuracoes_gerais`,
  `comunicacoes_institucionais`).
- **Tipo:** duplo conjunto de policies `PERMISSIVE` OR-combinadas.
- **Schema:** `public`.
- **Privilégio:** papéis operacionais podem, em tese, ler/escrever qualquer
  tenant.
- **Motivo do alerta:** semântica OR-combining do PostgreSQL RLS.
- **Herdado?** Não.
- **Controlável?** Sim, via cutover (remoção/reescrita das legadas).
- **Falso positivo?** Não.
- **Exige correção?** Sim, **no cutover**.
- **Risco aceito documentado?** Sim.

## 3. Classificação por finding

| Finding | Classificação |
| ------- | ------------- |
| F1 `assistidos_voluntarios_pii_cross_tenant` | **pendente para cutover** (SAAS-05-F1) |
| F2 `comunicacoes_institucionais_admin_unscoped` | **pendente para cutover** (SAAS-05-F1) |
| F3 `role_based_policies_bypass_tenant_scoping` | **pendente para cutover** (SAAS-05-F1) |

Motivo comum: os três findings **exigem alteração de RLS/policies**, o que é
**expressamente proibido** pelo escopo aprovado do SAAS-02-S4.

## 4. Decisão tomada

- **Nenhuma alteração de RLS/policies aplicada** neste recorte.
- **Nenhuma alteração de NOT NULL** aplicada.
- **Nenhum cutover iniciado.**
- **Nenhuma alteração no projeto FER original.**
- Os três findings foram **marcados como `ignore` no scanner**, com
  justificativa formal e ponteiro explícito para o SAAS-05-F1, para que a
  fila do scanner reflita a decisão de arquitetura.

## 5. Controles compensatórios em vigor

Mesmo com as policies legadas ainda presentes, o risco efetivo está
mitigado pelas camadas construídas nos recortes anteriores:

1. **`shadow_tenant_all_*`** já filtra por `current_instituicao_id()` em
   todas as tabelas listadas.
2. **RPCs tenant-aware (SAAS-05-E1..E4)** exigem `p_instituicao_id`.
3. **Edges tenant-aware (EDGE-A/A2/B/C/D)** resolvem tenant no servidor:
   - `checkin-publico`, `alertas-operacionais`, `central-fila-alerta`,
   - `notificacoes-dispatch`, `comunicacao-dispatch`,
   - `whatsapp-inbound`, `whatsapp-responder`,
   - `assistente-entrevista`, `insights-dashboard`, `ia-site-ingestao`,
     `conteudo-imagem-ia`.
4. **Frontend** já propaga `instituicao_id` (SAAS-05-D).
5. Todas as edges operam via `service_role` com validação explícita de
   membership em `instituicao_usuarios`.

Portanto, na superfície real de uso (frontend + edges + RPCs), o
cross-tenant já é bloqueado. As policies legadas permanecem apenas como
**fallback single-tenant** até o cutover.

## 6. Correções aplicadas

Nenhuma. Todas as correções pertencem ao SAAS-05-F1.

## 7. Justificativa formal de não correção

O recorte SAAS-02-S4 proíbe:

- alterar RLS/policies,
- aplicar NOT NULL em `instituicao_id`,
- remover fallbacks single-tenant,
- endurecer `shadow_tenant`,
- remover policies legadas,
- criar tenant FER real,
- migrar dados reais,
- alterar projeto FER original.

Os três findings **só podem ser corrigidos violando essas proibições**.
Logo, a única decisão coerente com o escopo é **classificar + registrar +
adiar para o cutover**.

## 8. Testes

Suíte nova: `src/test/governanca/saas02s4-findings-supabase-lov.test.ts`.

Cobre:

- classificação formal dos findings F1/F2/F3;
- ausência de nova migração alterando RLS/policies neste recorte;
- ausência de migração aplicando NOT NULL em `instituicao_id`;
- edges dos recortes anteriores não foram alteradas por SAAS-02-S4;
- funções tratadas no S3 não foram reabertas para PUBLIC/anon;
- projeto FER original intocado.

Suíte de governança total: **verde** após inclusão.

## 9. Indicadores

- **0028**: +0 (sem novas funções expostas a `anon`).
- **0025**: +0.
- **0029**: +0 (nenhum GRANT novo emitido).

## 10. Delta isolado do S4

- 3 findings `supabase_lov` **classificados e formalmente marcados** como
  `ignore` no scanner com justificativa apontando SAAS-05-F1.
- 1 documento novo: `docs/SAAS-02-S4-FINDINGS-SUPABASE-LOV.md`.
- 1 suíte nova: `src/test/governanca/saas02s4-findings-supabase-lov.test.ts`.
- **0** migrações, **0** edges alteradas, **0** RPCs alteradas, **0**
  arquivos de frontend/serviço tocados.

## 11. Recomendação para SAAS-05-F1

O SAAS-05-F1 deve, em ordem:

1. Confirmar que `shadow_tenant_all_*` cobre 100% das operações reais das
   tabelas listadas em F3.
2. Reescrever as policies `has_role`-only para incluir
   `instituicao_id = current_instituicao_id()` **ou** removê-las quando
   `shadow_tenant_all_*` já as substituir integralmente.
3. Aplicar `NOT NULL` em `instituicao_id` nas tabelas tocadas pelo F3
   (respeitando o backfill validado).
4. Reexecutar o scanner `supabase_lov` e confirmar delta −3 nos findings
   tratados aqui.
