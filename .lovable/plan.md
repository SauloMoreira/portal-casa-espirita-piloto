# SAAS-06-C1-STAB07 — Plano de Ação (Diagnóstico + Correção)

> Escopo: agendamento cria sessões em `agenda_tratamentos_assistido`, mas o vínculo em `assistido_tratamentos` permanece `aguardando_agendamento` / `data_inicio = NULL`.
> **Nenhuma alteração aplicada nesta etapa.** Aguardando aprovação explícita.

---

## 1. Fluxo atual do agendamento

Componente: `src/pages/CoordenadorListaEspera.tsx`
Função: `handleAgendar` (linhas ~155–210)

Sequência observada:

```
UI: botão "Agendar" (linha do item)
 → abre Dialog "Agendar 1ª Sessão"
 → coordenador informa data + (holístico) horário
 → clique em "Confirmar Agendamento"
 → handleAgendar():
     1. Validações locais (data, dia_semana, holístico exige horário)
     2. Monta array `sessions[]` com N linhas (quantidade_total)
     3. supabase.from("agenda_tratamentos_assistido").insert(sessions)
          ← captura { error: agendaErr }
          ← se erro: toast + return (sem rollback)
     4. supabase.from("assistido_tratamentos").update({
            status: "aguardando_inicio",
            data_inicio: dataInicial,
            agendado_por: user.id
        }).eq("id", selectedItem.id)
          ← **NÃO** desestrutura `error`
          ← **NÃO** verifica retorno
          ← **NÃO** faz rollback das sessões inseridas
     5. toast "Tratamento agendado com sucesso!"
     6. Fecha dialog, abre Carta, chama fetchData()
```

## 2. Chamadas executadas e ordem

| # | Tipo | Alvo | Erro tratado? |
|---|------|------|---------------|
| 1 | INSERT (bulk) | `agenda_tratamentos_assistido` (N linhas) | Sim (return) |
| 2 | UPDATE | `assistido_tratamentos` (status/data_inicio/agendado_por) | **Não** |

Sem transação. Sem RPC. Sem lock. Sem idempotency key. Sem debounce/disable persistente contra duplo clique além do `saving`.

## 3. Onde ocorre o sucesso parcial

Etapa 4: o UPDATE do vínculo falha silenciosamente (provavelmente por RLS/policy do `assistido_tratamentos` para papel `coordenador_de_tratamento`, ou por CHECK do enum de status). Como o retorno de `error` não é lido, o frontend segue para o toast de sucesso e abre a Carta, deixando:

- N sessões persistidas
- vínculo intacto (`aguardando_agendamento`, `data_inicio = NULL`)

## 4. Erro atualmente ignorado

Retorno de `supabase.from("assistido_tratamentos").update(...)` — `error` nunca é lido. Também não há verificação de `count`/linhas afetadas, nem `.select().single()`.

## 5. RPC existente reutilizável?

Não identificada RPC transacional para "confirmar agendamento inicial". Existem `fn_tratamentos_do_coordenador`, `fn_listar_coordenacao_tratamentos`, `fn_lista_espera_coordenador` (leitura). Fluxo de plano/orquestração (`agendaPlano/orquestracao.ts`) trata outro caso (planos multi-etapa), não o agendamento inicial da Lista de Espera. **Nada reutilizável diretamente.**

## 6. Status canônicos (a confirmar em Etapa Diagnóstico)

Referência atual em `src/constants/status.ts` (`VINCULO_STATUS`):
`aguardando_inicio | aguardando_liberacao | aguardando_agendamento | liberado | em_andamento | concluido | suspenso | cancelado`.

A confirmar via inspeção do check constraint real (`assistido_tratamentos_status_check`) e do consumo em Lista de Espera, "Tratamentos sob minha coordenação", Agenda, Presença.

## 7. Status correto após agendamento

Hipótese canônica: `aguardando_inicio` (vínculo sai da Lista de Espera; entra em "Tratamentos sob minha coordenação"; transição para `em_andamento` ocorre no lançamento da 1ª presença — a validar contra triggers/hooks existentes).

## 8. Regra correta de `data_inicio`

Data da 1ª sessão real gerada (equivale à data escolhida pelo coordenador quando a 1ª sessão é a data escolhida). Fonte de verdade: menor `data_sessao` do lote inserido em `agenda_tratamentos_assistido` para o vínculo.

## 9. Causa raiz

**C-Root:** `handleAgendar` executa UPDATE sem verificar erro/linhas afetadas. Provável bloqueio por RLS de `assistido_tratamentos` no papel `coordenador_de_tratamento` (o coordenador tem SELECT via `fn_coordenador_pode_ver_assistido`, mas não necessariamente UPDATE do vínculo), ou por policy que exige `admin`/`entrevistador`.

Precisa ser confirmado em Etapa 1 diagnóstica: listar policies de UPDATE em `public.assistido_tratamentos` e testar o UPDATE real com a sessão do coordenador.

## 10. Estratégia de atomicidade

**Opção B (recomendada):** nova RPC `SECURITY DEFINER` `public.fn_coordenador_confirmar_agendamento(p_vinculo_id uuid, p_data_inicio date, p_horario time null, p_sessoes jsonb)` que, em transação única:

1. `SELECT ... FOR UPDATE` no vínculo
2. Valida: tenant, papel coordenador, designação no tratamento, status atual = `aguardando_agendamento`, saldo, ausência de sessões futuras já criadas para o vínculo
3. INSERT em `agenda_tratamentos_assistido` (bulk)
4. UPDATE em `assistido_tratamentos` (status canônico, `data_inicio`, `agendado_por`)
5. INSERT em `audit_logs`
6. Retorna `{ sessoes_criadas, novo_status, data_inicio }`

Falha em qualquer passo → rollback nativo Postgres.

## 11. Estratégia de idempotência

- Validação no passo 2: se já existem sessões futuras (`data_sessao >= current_date`) para o vínculo, aborta com erro funcional `AGENDAMENTO_JA_EXISTE`.
- Verificação de status: só transiciona a partir de `aguardando_agendamento`.
- Retry após timeout: segunda chamada encontra sessões e/ou status já mudado → erro funcional, sem duplicar.

## 12. Estratégia de concorrência

- `SELECT ... FOR UPDATE` no vínculo dentro da RPC.
- UI: botão `disabled` enquanto `saving` (já existe) + `saving` só limpa após retorno da RPC.
- Sem advisory lock (não necessário — vínculo é a granularidade certa).

## 13. Estratégia de rollback

Nativa da transação Postgres da RPC. Nada precisa ser compensado no frontend. Em erro:
- Toast: "Não foi possível concluir o agendamento. Nenhuma alteração foi aplicada. Tente novamente ou abra um chamado técnico."
- Código: `AGENDAMENTO_TRATAMENTO_COMMIT_FAILED`
- Modal permanece aberto; Carta **não** abre; `fetchData()` só roda em sucesso.

## 14. Reconciliação do registro atual

**Fora deste patch.** Plano separado, executado após aprovação da correção:

1. Query de inventário (read-only): vínculos com `status = 'aguardando_agendamento'` que têm ≥1 sessão futura em `agenda_tratamentos_assistido`.
2. Apresentar lista para revisão manual (esperado: 1 vínculo — Assistido Teste 01 / Reiki).
3. Migration cirúrgica com UPDATE por ID explícito, `data_inicio = MIN(data_sessao)`, com audit_log.
4. Sem backfill amplo, sem criação/remoção de sessões.

## 15. Modelo de autorização (RPC)

- `SECURITY DEFINER`, `search_path = public, pg_temp`
- `auth.uid()` obrigatório (nunca receber user_id como parâmetro)
- Validar: `has_role(auth.uid(), 'coordenador_de_tratamento')` OU `has_role(auth.uid(), 'admin')`
- Validar: vínculo institucional ativo do coordenador na `instituicao_id` do vínculo
- Validar: designação em `coordenacao_tratamento` para o `tratamento_id` (exceto admin)
- REVOKE ALL FROM PUBLIC, anon
- GRANT EXECUTE TO authenticated
- Retorno mínimo, sem PII em logs
- Objetos totalmente qualificados

## 16. Patch mínimo proposto

**Backend (migration):**
- Criar `public.fn_coordenador_confirmar_agendamento(...)` (RPC transacional).
- Grants conforme §15.

**Frontend:**
- `src/pages/CoordenadorListaEspera.tsx` → `handleAgendar` passa a chamar `supabase.rpc("fn_coordenador_confirmar_agendamento", {...})` com tratamento de erro completo; remove os dois calls diretos (INSERT + UPDATE).

**Nada mais.** Sem tocar em: services de agenda, hooks, orquestração de plano, RLS de outras tabelas, seed, config, testes de outros recortes.

## 17. Arquivos que poderiam ser alterados

- `supabase/migrations/<novo>.sql` (nova RPC + grants)
- `src/pages/CoordenadorListaEspera.tsx` (apenas `handleAgendar` e mensagens)
- `src/test/governanca/saas06c1-stab07-*.test.ts` (novo, testes estáticos)

## 18. Migration/RPC necessária?

Sim: nova RPC `fn_coordenador_confirmar_agendamento`. Sem alteração de tabelas, enums, RLS existente, triggers ou policies.

## 19. Dados que precisariam de reconciliação

1 vínculo confirmado (Assistido Teste 01 / Reiki, 4 sessões futuras, status inconsistente). Tratado em plano separado (§14).

## 20. O que NÃO será alterado

STAB06 (Carta), STAB08-RLS, STAB09, menus, catálogo global de tratamentos, planos, módulos, assinaturas, chamados, sessões públicas, voluntários, branding, orquestração de plano multi-etapa, agenda de outros tratamentos, presença, tarefeiro, entrevista, cadastro rápido.

## 21. Testes específicos (STAB07)

- Positivo: coordenador agenda vínculo `aguardando_agendamento` → N sessões + status `aguardando_inicio` + `data_inicio` correto + auditoria.
- Atomicidade: forçar erro no UPDATE → 0 sessões persistidas.
- Idempotência: 2ª chamada com mesmo vínculo → erro funcional, sem duplicar sessões.
- Concorrência: 2 requisições simultâneas → apenas 1 vence.
- Status errado (ex: `em_andamento`) → bloqueado.
- Coordenador sem designação no tratamento → bloqueado.
- Coordenador de outro tenant → bloqueado.
- Assistido, tarefeiro, anon → bloqueados.
- Cross-tenant (Reiki global, assistido Casa Demo, coordenador FER) → bloqueado.

## 22. Testes de regressão

Lista de Espera, "Tratamentos sob minha coordenação", Agenda do Tratamento, STAB08-RLS, STAB09, entrevista, cadastro principal/rápido, Gestão de Acesso, Escopo Operacional, sessões públicas, chamados, planos/módulos/assinaturas. Suítes: SAAS-06-C1, integração DB/RLS, completa, `tsgo --noEmit`, build, reteste manual publicado.

## 23. Riscos

- RLS de `assistido_tratamentos` pode ter policy `authenticated` genérica que já permitiria o UPDATE — nesse caso a causa raiz é outra (enum, trigger, RLS de agenda). Diagnóstico Etapa 1 precisa confirmar antes do patch.
- Regra de `data_inicio` pode ter dependência com triggers existentes (`liberação sequencial`, `INV-*`). Confirmar em Etapa 1.
- Reconciliação precisa validar que as 4 sessões de fato pertencem ao vínculo alvo.

## 24. Critérios de aceite

- Agendar pela Lista de Espera atualiza status e `data_inicio` em uma única operação atômica.
- Erro em qualquer passo → 0 sessões, 0 mudança de status, toast claro, modal aberto.
- Vínculo agendado desaparece da Lista de Espera e aparece em "Tratamentos sob minha coordenação".
- Sem duplicação em duplo clique / retry.
- Cross-tenant e papéis não autorizados bloqueados no backend.
- Suítes existentes verdes; nova suíte STAB07 verde; tsgo e build limpos.
- Registro inconsistente atual só é corrigido no plano de reconciliação separado, após aprovação.

---

**Aguardando aprovação explícita para executar Etapa 1 (diagnóstico read-only) — inspecionar policies/constraints reais de `assistido_tratamentos`, confirmar causa raiz e apresentar patch final.**
