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
- **Status:** 📋 Backlog
- **Objetivo:** Fazer `fn_sanear_fila_notificacoes` cobrir também entrevistas
  inelegíveis (hoje cobre apenas sessões; entrevistas são barradas só no dispatch).
- **Impacto:** Consistência simétrica entre sessões e entrevistas; itens
  inelegíveis são saneados proativamente em vez de apenas no momento do envio.
- **Próximo passo recomendado:** estender a função para varrer
  `entrevista_lembrete`/`entrevista_criada` usando `fn_fila_motivo_inelegivel`
  (já cobre entrevistas) e cancelar com log, como já faz para sessões.
- **Invariantes a observar:** INV-FILA-001/002/006, INV-GOV-002.

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
