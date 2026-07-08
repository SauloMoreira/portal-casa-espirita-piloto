# SAAS-05-E2 — RPCs tenant-aware do núcleo Assistidos/Agenda/Tratamentos (lote 2)

**Status:** Concluído · **Recorte:** SAAS-05-E2
**Depende de:** SAAS-05-B (colunas `instituicao_id`) · SAAS-05-C (helpers/shadow) · SAAS-05-D (propagação frontend) · SAAS-05-E1 (padrão de overload tenant-aware)
**Habilita:** SAAS-05-E3/E4 (entrevistas, relatórios, Central IA) · SAAS-05-E-EDGE (edge functions) · SAAS-05-F (cutover RLS + `NOT NULL`)

---

## 1. Objetivo

Tornar as RPCs internas do núcleo funcional do módulo Tratamentos
(**presença/ausência**, **plano/conversão**, **rollback** e **auditoria de
homologação**) tenant-aware, recebendo `p_instituicao_id` obrigatoriamente e
validando autorização por instituição + pertinência do recurso antes de
executar qualquer efeito. Segue estritamente o padrão aprovado no
SAAS-05-E1.

---

## 2. Inventário (RPCs relacionadas)

Consulta realizada em `pg_proc` (schema `public`) sobre chamadas presentes
em services do frontend:

| RPC | Assinatura legada | Tabela alvo | Tratada em E2? |
| --- | --- | --- | --- |
| `pts_registrar_presenca` | `(uuid,date,uuid,int,date,time)` | `agenda_tratamentos_assistido` via `assistido_tratamentos` | ✅ |
| `pts_registrar_ausencia` | `(uuid,date,uuid,date,time)` | idem | ✅ |
| `pts_rollback_piloto` | `(uuid)` | `assistidos` | ✅ |
| `pts_homologacao_auditar` | `(uuid,text,jsonb)` | `audit_logs` (via assistido) | ✅ |
| `pts_converter_assistido` | `(uuid,jsonb)` | `assistidos` + plano | ✅ |
| `pts_persistir_plano` | `(uuid,jsonb,jsonb)` | `plano_tratamento_sessoes` via `assistido_tratamentos` | ✅ |
| `registrar_presenca` (legado) | `(uuid,date,text,uuid,text)` | `presencas_tratamentos` via `assistido_tratamentos` | ✅ |
| `fn_tratamentos_do_coordenador` | `(uuid)` | `coordenacao_tratamento` × `tipos_tratamento` | ❌ (adiado — `tipos_tratamento` ainda não é T-DIR) |
| `fn_listar_coordenacao_tratamentos` | `()` | idem | ❌ (adiado) |
| `fn_designar_coordenador` | `(uuid,uuid)` | idem | ❌ (adiado) |
| `fn_remover_coordenador` | `(uuid,uuid)` | idem | ❌ (adiado) |
| `fn_registrar_aviso_ausencia` | `(text,uuid,text)` | `avisos_ausencia` (multi-caminho por tipo) | ❌ (adiado — depende de convergência de compromisso) |
| `fn_tratar_aviso_ausencia` | `(uuid,text,text)` | `avisos_ausencia` | ❌ (adiado) |
| `fn_avisos_ausencia_pendentes` | `(bool)` | `avisos_ausencia` | ❌ (adiado) |

RPCs adiadas ficam para **SAAS-05-E3** (entrevistas/avisos) e para o recorte
que tenantizar `tipos_tratamento` (coordenação). Nenhuma dependência do
frontend adaptado neste lote depende delas.

---

## 3. RPCs tratadas (7 novos overloads)

Cada RPC ganhou **um novo overload** com `p_instituicao_id uuid` obrigatório;
as assinaturas legadas foram **preservadas** para compatibilidade com callers
internos ainda não migrados (padrão idêntico ao SAAS-05-E1).

```
pts_registrar_presenca (uuid, date, uuid, integer, date, time, uuid)
pts_registrar_ausencia (uuid, date, uuid, date, time, uuid)
pts_rollback_piloto    (uuid, uuid)
pts_homologacao_auditar(uuid, text, jsonb, uuid)
pts_converter_assistido(uuid, jsonb, uuid)
pts_persistir_plano    (uuid, jsonb, jsonb, uuid)
registrar_presenca     (uuid, date, text, uuid, text, uuid)
```

---

## 4. Padrão de validação (cabeçalho dos overloads)

Idêntico ao SAAS-05-E1:

```sql
IF p_instituicao_id IS NULL THEN
  RAISE EXCEPTION 'p_instituicao_id é obrigatório' USING ERRCODE='22023';
END IF;
IF v_uid IS NULL THEN
  RAISE EXCEPTION 'Não autenticado.' USING ERRCODE='42501';
END IF;
IF NOT (public.is_platform_admin(v_uid)
        OR public.is_member_of_instituicao(v_uid, p_instituicao_id)) THEN
  RAISE EXCEPTION 'Acesso negado: usuário não pertence à instituição informada.'
    USING ERRCODE='42501';
END IF;
-- Pertinência do recurso (join com T-DIR pai):
IF <recurso> IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.assistido_tratamentos at
  JOIN public.assistidos a ON a.id = at.assistido_id
  WHERE at.id = <recurso>
    AND a.instituicao_id IS NOT NULL
    AND a.instituicao_id <> p_instituicao_id
) THEN RAISE EXCEPTION 'Vínculo não pertence à instituição informada.' USING ERRCODE='42501';
END IF;
PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
RETURN public.<rpc_legada>(<args>);
```

### Join usado para T-HER

- **T-HER com pai T-DIR direto** (`assistidos`): validação inline por
  `assistidos.id = p_assistido_id AND instituicao_id <> p_instituicao_id`.
- **T-HER via `assistido_tratamentos`** (vínculo): join
  `assistido_tratamentos → assistidos` conforme snippet acima.

Isso cobre `pts_registrar_presenca`, `pts_registrar_ausencia`,
`pts_persistir_plano` e `registrar_presenca` (todas recebem `p_vinculo_id`
ou `p_assistido_tratamento_id`).

---

## 5. `SET LOCAL app.current_instituicao`

Aplicado **após** a validação de membership + pertinência, imediatamente
antes do delegate para a assinatura legada. Não substitui a validação
explícita — é apoio para short-circuit da shadow policy (SAAS-05-C) no
cutover. Padrão:

```
PERFORM set_config('app.current_instituicao', p_instituicao_id::text, true);
```

---

## 6. Chamadas frontend/services alteradas

| Arquivo | RPC | Alteração |
| --- | --- | --- |
| `src/services/agendaPlano/planoRpcService.ts` | `pts_registrar_presenca` | injeta `p_instituicao_id: requireInstituicaoId()` |
| `src/services/agendaPlano/planoRpcService.ts` | `pts_registrar_ausencia` | idem |
| `src/services/agendaPlano/planoRpcService.ts` | `pts_rollback_piloto` | idem |
| `src/services/agendaPlano/planoRpcService.ts` | `pts_homologacao_auditar` | idem |
| `src/services/agendaPlano/orquestracao.ts` | `pts_converter_assistido` | idem |
| `src/services/agendaPlano/orquestracao.ts` | `pts_persistir_plano` | idem (loop cache do `instituicaoId` fora do laço) |
| `src/services/agendaPlano/orquestracao.ts` | `registrar_presenca` (legado) | idem + `p_observacao: null` explícito para casar a assinatura |

Todas leem o tenant **exclusivamente** via `requireInstituicaoId()`
(`@/lib/tenant/currentTenant`) — fail-closed, sem `localStorage`.

---

## 7. Testes executados

- Nova suíte: `src/test/governanca/saas05e2-rpcs-tenant-aware.test.ts` — **53 casos verdes**
  (7 RPCs × contratos de assinatura, NOT NULL, membership, SET LOCAL, revoke/grant,
  pertinência por join/direta, escopo preservado).
- Suíte Q1-C4 atualizada: `src/test/governanca/q1c4-plano-rpc-service.test.ts` — verde
  (payload esperado agora inclui `p_instituicao_id`).
- Suíte de roteamento operacional: `src/services/agendaPlano/roteamentoPresenca.test.ts` — verde
  (setup passou a fixar o tenant ativo via `_setCurrentInstituicaoId`).
- Suíte de homologação: `src/services/agendaPlano/orquestracao.test.ts` — verde (idem).
- Suíte total do projeto: **1341/1341 verdes**.
- `tsgo --noEmit`: limpo.

Validação real com banco (usuário A/B, vínculo inativo, platform_admin bypass,
recurso cross-tenant) fica em `src/test/integration/db/` para o cutover
posterior (SAAS-05-F/E-DB).

---

## 8. Escopo preservado (checklist)

- [x] Nenhuma alteração em RLS, policies, `NOT NULL` ou tabelas T-DIR/T-HER.
- [x] Nenhuma alteração em edge functions.
- [x] Nenhuma alteração no dispatcher/provider/notificações/check-in público/WhatsApp.
- [x] Nenhuma migração de dados reais.
- [x] Nenhuma alteração no projeto FER original (helpers e services herdados; comportamento preservado).
- [x] SAAS-02-S3 permanece no backlog — não iniciado.
- [x] Assinaturas legadas preservadas (backward-compatible).
- [x] Nenhum cutover realizado (RLS shadow permanece PERMISSIVE, sem endurecimento).
- [x] Coordenação e avisos-ausência **não** foram tocados neste recorte.

---

## 9. Indicadores (linter 0028/0025/0029)

Baseline pós-E1 reportado pelo time: `0028 ≈ 53 · 0025 = 0 · 0029 ≈ 95`.

Este recorte cria **7 novos overloads** `SECURITY DEFINER` com
`REVOKE ... FROM PUBLIC, anon` e `GRANT ... TO authenticated`. Isso os
classifica sob **0029** (esperado por design — pontos de entrada
autenticados do fluxo tenant-aware).

Delta isolado atribuível ao SAAS-05-E2:

- `0028`: **+0** (revogado PUBLIC/anon em todos os overloads).
- `0025`: **+0**.
- `0029`: **+7** (esperado por design; todos os 7 overloads).

A oscilação absoluta do linter em relação a outros recortes paralelos não é
atribuível a este.

---

## 10. Pendências (E3/E4/E-EDGE)

- **E3:** `fn_registrar_aviso_ausencia`, `fn_tratar_aviso_ausencia`,
  `fn_avisos_ausencia_pendentes`, `fn_entrevistas_operacional` e RPCs de
  fila da entrevista fraterna.
- **Coordenação:** requer tenantização prévia de `tipos_tratamento`
  (fora do escopo de E-*).
- **E-EDGE:** `checkin-publico`, `notificacoes-dispatch`, `whatsapp-*`,
  `comunicacao-dispatch`, `alertas-operacionais`, IA/cron — nada tocado.
- **Cutover (SAAS-05-F):** remoção das assinaturas legadas, `NOT NULL` em
  `instituicao_id`, endurecimento das shadow policies.

---

## 11. Confirmações finais

- Nenhuma edge function foi alterada (grep em `supabase/functions/` inalterado).
- RLS/policies/cutover/`NOT NULL` não foram alterados nesta migração.
- Projeto FER original não foi tocado.
- SAAS-02-S3 não iniciado neste recorte.
