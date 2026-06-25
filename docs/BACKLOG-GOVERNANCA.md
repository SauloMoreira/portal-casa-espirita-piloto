# Backlog formal de governança — Lacunas da Matriz de Eventos

> Documento vivo. Itens derivados da seção "Lacunas encontradas" de
> [`MATRIZ-EVENTOS-EFEITOS.md`](./MATRIZ-EVENTOS-EFEITOS.md). Cada item é
> confrontado com o [Catálogo de Invariantes](./INVARIANTES.md) antes de ser
> implementado. Status: `concluído` · `em andamento` · `planejado` · `backlog`.

Ordem de execução acordada: **L-02 (✅) → L-01 (✅) → L-03 (✅) → L-04 (✅)**.

---

## L-02 — Feedback de status para itens manuais/automáticos não enviados na Central
- **Prioridade:** Alta
- **Status:** ✅ Concluído
- **Objetivo:** Tornar explícito, na Central de Notificações, por que um item
  pendente/agendado ainda **não** foi enviado, distinguindo: aguardando janela
  de envio, aguardando limite diário, pendente normal, e bloqueado por
  inelegibilidade/opt-out/sem telefone/comunicação geral desativada.
- **Impacto:** Operação para de "achar" que uma mensagem manual sumiu ou falhou
  silenciosamente. Diagnóstico vem do backend (fonte única), espelhando a ordem
  de decisão do dispatch — sem lógica paralela na UI.
- **Entrega:**
  - RPC `fn_fila_diagnostico_pendentes()` (SECURITY DEFINER, STABLE, restrita a
    admin/master/coordenador) — espelha o dispatch; somente leitura.
  - `rotuloDiagnosticoPendencia()` em `notificacaoElegibilidade.ts` (rótulo/tom)
    + testes unitários.
  - Badge na lista da fila e banner no drawer de detalhe.
- **Invariantes preservadas:** INV-ARQ-001 (backend fonte da verdade),
  INV-ARQ-003/004 (sem lógica paralela na UI), INV-MANUAL-001/002, INV-SEG-001/002.
- **Próximo passo (opcional):** decidir política de **isenção de limite diário**
  para mensagem manual (hoje ela respeita o limite como qualquer item). Requer
  decisão de negócio antes de implementar.

---

## L-01 — Flag governada para confirmação imediata de entrevista
- **Prioridade:** Média
- **Status:** ✅ Concluído
- **Objetivo:** Submeter a confirmação imediata `entrevista_criada` (disparada no
  INSERT) à mesma governança das sessões, via parâmetro
  `entrevista_confirmacao_agendamento_ativa`, análogo a
  `tratamento_confirmacao_agendamento_ativa`.
- **Impacto:** Alinha EVT-08 a EVT-01; evita comunicação antecipada não desejada
  e dá contenção/controle sobre confirmações de entrevista sem mexer no lembrete
  de 24h.
- **Entrega:** parâmetro criado em `regras_operacionais` (booleano, governável,
  sensível, `confirmacao_reforcada`, **default `true`** para preservar o
  comportamento atual da casa de forma explícita); helper
  `fn_confirmacao_entrevista_ativa()` (`SECURITY DEFINER`, `SET search_path = public`);
  `fn_notif_entrevista()` só enfileira `entrevista_criada` quando a flag está
  ligada — o lembrete de 24h permanece sempre. Flag aparece automaticamente no
  painel de Governança de Parâmetros e toda alteração é auditada por
  `fn_atualizar_parametro_operacional`. Date-only preservado (sem horário fantasma,
  sem shift UTC), coberto por testes em `src/lib/notificacoes.test.ts`.
- **Invariantes observadas:** INV-GOV-001/002/003, INV-TEMPO-001..003, INV-FILA-006.

---

## L-03 — Classificação geral×operacional de presença e auditoria de `presencas_tratamentos`
- **Prioridade:** Média
- **Status:** ✅ Concluído
- **Objetivo:** Separar com clareza a classificação **geral** (histórica) da
  classificação **operacional** (decisão do sistema) dos registros de presença,
  com fonte única, e garantir auditoria adequada de `presencas_tratamentos`.
- **Entregue:**
  - Fonte única oficial `fn_presenca_classificacao` (backend, `IMMUTABLE`) +
    espelho `src/lib/presencaClassificacao.ts` (frontend) com testes.
  - `status_presenca` = classificação geral; operacional derivada (conta presença,
    conta ausência, dispara remarcação, avança sessão, somente histórico).
  - `justificado` formalizado como **somente histórico** (antes existia no constraint
    sem efeito operacional definido — fonte de ambiguidade).
  - `fn_notif_presenca` refatorada para consultar a fonte única (sem lista fixa);
    comportamento de avisos preservado.
  - Correção de bug em `PainelGerencial` (contava `justificado` como falta).
  - `constants/status.ts` (`PRESENCA_STATUS`) realinhado ao banco (reexporta a fonte
    única) — antes divergia com `falta`/`justificada`.
  - Auditoria confirmada suficiente: `trg_audit_presencas`/`fn_audit_trigger`
    (quem/quando/registro/JSON anterior+novo) + `PLANO_PRESENCA_AVANCO`.
  - `presenca_registrada`/`falta_registrada` mantidos como comunicação **operacional**
    (decisão explícita, não sujeita a `comunicacao_geral_ativa`).
- **Sem alteração de schema:** a classificação operacional é totalmente derivável;
  adicionar coluna criaria estado redundante sujeito a drift.
- **Invariantes:** INV-ARQ-001/002/003, INV-PRES-001/002/003, INV-SEG-003.

---

## L-04 — Estender saneamento da fila a entrevistas
- **Prioridade:** Baixa
- **Status:** ✅ Concluído
- **Objetivo:** Fazer `fn_sanear_fila_notificacoes` cobrir também entrevistas
  inelegíveis (antes cobria apenas sessões; entrevistas eram barradas só no dispatch).
- **Impacto:** Consistência simétrica entre sessões e entrevistas; itens
  inelegíveis de entrevista (inexistente/cancelada/remarcada/vencida) são saneados
  proativamente em vez de apenas no momento do envio. O dispatch permanece como
  barreira final — saneamento e trava trabalham juntos.
- **Entregue:**
  - `fn_sanear_fila_notificacoes` estendida para varrer também
    `entrevista_lembrete`/`entrevista_criada`, **delegando 100% a decisão** à
    fonte única `fn_fila_motivo_inelegivel` (que já reconhece entrevistas) — sem
    regra paralela e sem copiar a lógica de sessões.
  - Motivos próprios do domínio reaproveitados da fonte única:
    `entrevista_inexistente`, `entrevista_cancelada`, `entrevista_remarcada`
    (lembrete com versão/epoch superado), `entrevista_vencida`.
  - Histórico preservado: só cancela itens `pendente`/`agendado`, com trilha em
    `notificacoes_log`.
  - Espelho de elegibilidade em TS (`motivoInelegibilidadeEntrevista` em
    `notificacaoElegibilidade.ts`) para Central/testes, replicando a ordem do
    banco e mantendo **date-only** (sem horário fantasma, sem shift UTC).
  - Central já dispõe dos rótulos de entrevista em `MOTIVO_LABEL` (sem mudança
    necessária de UI).
- **Sem alteração de schema.**
- **Invariantes observadas:** INV-FILA-001/002/006, INV-GOV-002, INV-TEMPO-001..003.

---

## L-05 — Override manual auditado para limite diário
- **Prioridade:** Baixa/Média
- **Status:** 📋 Backlog (só se houver necessidade operacional recorrente real)
- **Objetivo:** Permitir que um operador autorizado ultrapasse, de forma auditada,
  o limite diário de mensagens em casos pontuais — sem remover o limite padrão.
- **Contexto:** Decisão de L-02 manteve a mensagem manual respeitando o limite
  diário por padrão (segurança, previsibilidade, consistência com o pipeline e
  proteção contra excesso). Este item formaliza a exceção controlada caso surja
  demanda operacional concreta.
- **Impacto:** Flexibilidade operacional sem abrir mão de governança; cada override
  fica rastreável (quem, quando, motivo).
- **Próximo passo recomendado:** só iniciar mediante necessidade real; ao iniciar,
  exigir RPC `SECURITY DEFINER` com checagem de papel, registro do override em
  auditoria e justificativa obrigatória — nunca bypass silencioso.
- **Invariantes a observar:** INV-GOV-001/002/003, INV-FILA-003.

---

## L-06 — Camada de testes de invariantes & contratos
- **Prioridade:** Alta
- **Status:** ✅ Concluído
- **Objetivo:** Transformar a governança (INV-*, contratos críticos) em proteção
  automatizada executável a cada mudança.
- **Impacto:** Regressões estruturais passam a ser detectadas pela suíte; quando um
  teste falha, fica explícita a invariante/contrato violado.
- **Entregue:**
  - Suíte dedicada em `src/test/governanca/` (10 arquivos, 74 testes) organizada por
    blocos de governança (agenda/tratamento, fila, temporal, exceção, ação manual,
    presença, contratos de backend, parâmetros, Central, regressão histórica).
  - Cada teste aponta a invariante (`INV-*`) ou o contrato protegido.
  - Mapa de cobertura em `docs/MAPA-COBERTURA-INVARIANTES.md` (protegida/parcial/pendente).
  - Bugs históricos viraram regressão permanente: horário fantasma, cadeia futura,
    confirmação antecipada indevida, justificado como falta, entrevista inválida na
    fila, lembrete duplicado por remarcação.
- **Sem alteração de schema.** Suíte total: 901 testes verdes.
- **Pendências (próxima sequência):** itens ⬜ do mapa dependem de execução real no
  banco (triggers, RLS, auditoria, idempotência de RPC) → ver L-07.
- **Invariantes observadas:** todas as testáveis em lógica pura/espelho.

---

## L-07 — Testes de integração REAL de banco (RLS/permissão, auditoria, idempotência, triggers)
- **Prioridade:** Média
- **Status:** ✅ Concluído
- **Objetivo:** Sair do "bem coberto localmente" (espelhos/lógica pura) para
  "também comprovado na execução real do banco" — cobrir as invariantes ⬜ cujo
  efeito só é observável em runtime (triggers, auditoria, idempotência, checagem
  de papel em RPC).
- **Entregue:**
  - Camada dedicada `src/test/integration/db/` (5 arquivos, **18 testes**) com
    runner próprio `npm run test:db` (`vitest.integration.db.config.ts`), **fora**
    do CI/unit (excluída em `vitest.config.ts`). Convenção `*.dbtest.ts`.
  - Ambiente controlado e reprodutível: cada teste roda em transação **sempre
    revertida** (`withRollback`), descobre dados em runtime (sem UUID frágil) e
    simula o usuário via `request.jwt.claims` (igual ao Supabase).
  - **Permissão real (INV-ARQ-004/INV-SEG-001):** `fn_atualizar_parametro_operacional`,
    `fn_enfileirar_mensagem_manual` e `fn_encerrar_item_fila_erro_cadastro` barram
    papéis não autorizados e anon — prova no backend, não na UI.
  - **Trigger governado de entrevista (caso B / `fn_confirmacao_entrevista_ativa`):**
    flag ON enfileira `entrevista_criada`; OFF não; lembrete sempre; date-only sem
    horário fantasma (24h antes, tolerância 1 min).
  - **Auditoria real (INV-ARQ-003/PRES-003/GOV-002):** parâmetro, presença e
    entrevista gravam trilha (quem/antes/depois/vínculo) em `audit_logs`.
  - **Idempotência real (INV-SEG-003):** barreira `dedupe_key` UNIQUE +
    `ON CONFLICT DO NOTHING` não duplica nem sobrescreve item.
  - **Coerência banco × espelho:** `fn_presenca_classificacao` concorda com o
    espelho TS; justificado permanece só histórico.
- **🐞 Achado crítico corrigido:** a suíte real flagrou que **registrar presença
  `presente`/`ausente` falhava em runtime** — `fn_notif_presenca` passava
  `v_evento` (text) para `fn_enqueue_notificacao` cujo 1º parâmetro é o enum
  `notif_evento` (text→enum sem cast implícito na resolução). Regressão do refactor
  L-03, **invisível** à suíte de espelho. Corrigido por migração
  (`v_evento::notif_evento`) e travado pelo teste `auditoria.dbtest.ts`.
- **Pendências explícitas (limites do ambiente):** enforcement de RLS *por linha*
  não é executável no sandbox (`BYPASSRLS`, sem `SET ROLE`) — mitigado por
  presença de políticas + checagem de papel nas RPCs + security scanner; fechar de
  fato exige E2E via PostgREST com JWT real. Efeito real de exceção na agenda
  (INV-AGD-005) e confirmação de UI (INV-SEG-002) ficam como E2E futuro.
- **Migração corretiva aplicada (2026-06-25):** `fn_notif_presenca` recriada com
  `v_evento::notif_evento`. Rerun pós-aplicação: **AVM-001 resolvido** (registro de
  presença `presente`/`ausente` agora enfileira sem erro).
- **Sem regressão (rerun pós-migração):** suíte unitária/governança **901 verde**;
  suíte de banco **18 verde**.
- **Invariantes observadas:** INV-ARQ-003/004, INV-SEG-001/003, INV-PRES-003,
  INV-GOV-001/002, INV-FILA-005, INV-TEMPO-001..003.

## P1.1 — E2E real de RLS por linha (JWT + PostgREST) — ✅ CONCLUÍDO E APROVADO
- **Aprovação formal:** frente fechada e aprovada pelo responsável (2026-06-25).
  Validado: RLS por linha (JWT/PostgREST real), payload por perfil, bloqueio de
  acesso indevido, entrevistas/avisos/parâmetros/RPCs sensíveis protegidos,
  cleanup namespaced sem resíduos e zero side effects operacionais.
- **Objetivo:** fechar a principal lacuna remanescente de segurança real — provar,
  com JWT e PostgREST reais, que cada perfil recebe exatamente o que pode ver.
- **Entrega:** suíte dedicada `src/test/e2e-rls/*.e2etest.ts` (`npm run test:e2e:rls`),
  separada de unit/governança e do runner de banco. **36/36 verde.**
  - `entrevistas-privacidade.e2etest.ts` (7), `avisos-ausencia.e2etest.ts` (7),
    `parametros-governados.e2etest.ts` (5), `rpcs-sensiveis.e2etest.ts` (17).
- **Perfis reais:** 5 contas namespaced (`e2e-rls-*@lovable.test`, segredo
  `E2E_RLS_PASSWORD`) + anônimo + sem-JWT. Seed/cleanup namespaced (`e2e_rls`).
- **Provas observadas (comportamento, não “tem política”):**
  - Tarefeiro nunca vê `observacoes/decisoes` da entrevista (tabela vazia; RPC
    operacional com payload reduzido de 6 colunas).
  - Aviso de ausência: tarefeiro só metadados (`pode_ver_conteudo=false`,
    `motivo=null`); equipe vê conteúdo; assistido só as próprias linhas.
  - Parâmetros governados: só admin altera; demais → `Permissão negada`; anon 401.
  - 7 RPCs sensíveis: perfil correto passa, indevido recebe erro coerente, anon 401.
  - RLS por linha: coordenador fora de escopo e assistido alheio → vazio.
- **Pendência anterior fechada:** “enforcement de RLS por linha não executável no
  sandbox” deixa de ser mitigação e passa a **prova real**.
- **Sem regressão:** unit/governança **921 verde**; banco real **27 verde**; tsgo limpo.
- **Fora de escopo:** efeito real de exceção na agenda (INV-AGD-005) e confirmação
  de UI (INV-SEG-002) seguem como E2E de interface futuro.

## INV-SEG-005 (nova invariante)
> Em superfícies sensíveis, o **payload final sob JWT real** deve respeitar o menor
> privilégio: campos sensíveis ausentes/nulos para perfis restritos, flags como
> `pode_ver_conteudo` coerentes, listas reduzidas por perfil e zero vazamento
> indireto — provado por comportamento real (PostgREST), não só por política criada.
