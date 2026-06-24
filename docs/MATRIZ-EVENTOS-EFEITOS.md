# Matriz de Eventos e Efeitos Colaterais do Sistema

> Documento **oficial e vivo** de governança técnica. Formaliza, por evento relevante,
> o que o sistema realmente faz — e o que deve fazer — em termos de **agenda, fila,
> dispatch, Central de Notificações, auditoria e elegibilidade**.
>
> Use junto com o [Catálogo de Invariantes](./INVARIANTES.md). Toda mudança deve
> responder: *"Esta mudança preserva os efeitos colaterais já consolidados e as
> invariantes relacionadas?"* Se a resposta for "não", a entrega **não está pronta**.

## Como esta matriz foi construída

Cada linha foi confrontada com o backend real (fonte de verdade):
triggers em `agenda_tratamentos_assistido`, `entrevistas_fraternas`, `presencas_tratamentos`;
funções `fn_notif_sessao`, `fn_notif_entrevista`, `fn_notif_presenca`,
`fn_promover_proxima_sessao`, `fn_proxima_sessao_vinculo`, `fn_eh_proxima_sessao`,
`fn_fila_motivo_inelegivel`, `fn_sanear_fila_notificacoes`,
`fn_processar_excecao_notificacoes`, `fn_excecao_alvos`,
`fn_enfileirar_mensagem_manual`, `fn_encerrar_item_fila_erro_cadastro`,
`fn_atualizar_parametro_operacional`; e a edge function `notificacoes-dispatch`.

Legenda de status de aderência:
- ✅ **Aderente** — comportamento real bate com a invariante.
- 🟡 **Parcial / atenção** — funciona, mas há observação ou lacuna a monitorar.
- 🔴 **Lacuna** — comportamento desejado ainda não implementado (não mascarar como pronto).

---

## 1. Matriz consolidada de eventos

### EVT-01 — Sessão de tratamento criada / agendada
- **Gatilho real:** `trg_notif_sessao` → `fn_notif_sessao()` em `INSERT` de `agenda_tratamentos_assistido` (somente `status = 'agendado'`).
- **Pré-condições:** a sessão precisa ser a **próxima sessão real** do vínculo (`fn_eh_proxima_sessao`). Plano previsto (sessões futuras encadeadas) **não** dispara nada.
- **Efeito na agenda:** nenhum (a sessão já foi inserida; o trigger só reage).
- **Efeito na fila:**
  - `sessao_lembrete` enfileirado com `scheduled_at = início − antecedência oficial` (`fn_lembrete_antecedencia_horas`, padrão 24h).
  - `sessao_criada` (confirmação imediata) **só** se `fn_confirmacao_agendamento_ativa()` = true. Por padrão **não** enfileira.
- **Efeito no dispatch:** o lembrete fica `agendado` até a janela; revalidado por `fn_fila_motivo_inelegivel` no envio.
- **Efeito na Central:** item aparece como `sessao_lembrete` com `scheduled_at` futuro.
- **Efeito na auditoria:** `trg_audit_agenda` registra a mudança da agenda.
- **Invariantes:** INV-AGD-001, INV-AGD-002, INV-FILA-001, INV-FILA-003, INV-FILA-004, INV-FILA-005.
- **Status:** ✅

### EVT-02 — Lembrete de sessão
- **Gatilho real:** criação do item em EVT-01 / `fn_promover_proxima_sessao`. Envio efetivo pelo `notificacoes-dispatch`.
- **Pré-condições de envio (trava final):** próxima sessão real válida, não vencida, dentro da janela horária, abaixo do limite diário, com telefone e sem opt-out.
- **Efeito na fila/dispatch:** se inválido → `cancelado` com motivo (`sessao_substituida`, `sessao_cancelada`, `sessao_nao_agendada`, `lembrete_vencido`, `sessao_futura_nao_proxima`); se válido e fora da janela → permanece `agendado`.
- **Efeito na auditoria:** `notificacoes_log` registra cada saída (enviado/cancelado/falha).
- **Invariantes:** INV-FILA-002, INV-FILA-003, INV-FILA-006, INV-AGD-001.
- **Status:** ✅

### EVT-03 — Presença registrada
- **Gatilho real:** `fn_notif_presenca()` em `presencas_tratamentos` (INSERT/UPDATE), apenas quando o `status_presenca` muda e a classificação operacional tem `evento_notificacao` (presente → `presenca_registrada`).
- **Classificação geral×operacional (L-03):** `status_presenca` é a classificação **geral** (histórica). A classificação **operacional** vem da fonte única `fn_presenca_classificacao` (backend) espelhada em `src/lib/presencaClassificacao.ts` (frontend): `presente` ⇒ conta presença, avança sessão, notifica.
- **Efeito na fila:** `presenca_registrada` imediato (`scheduled_at = now()`), dedupe por `presenca_id:data`.
- **Efeito no dispatch:** classificada por `classificarEvento` como **operacional** (não sujeita a `comunicacao_geral_ativa`); respeita opt-out, janela e limite diário.
- **Auditoria:** trigger `trg_audit_presencas` → `fn_audit_trigger` grava em `audit_logs` (quem, quando, registro, JSON anterior/novo); avanço de plano registra `PLANO_PRESENCA_AVANCO`.
- **Invariantes:** INV-ARQ-001/002/003, INV-SEG-003 (idempotência via dedupe), INV-PRES-001/002/003.
- **Status:** ✅ — L-03 resolvido (fonte única + auditoria confirmada).

### EVT-04 — Ausência / falta registrada
- **Gatilho real:** `fn_notif_presenca()` quando a classificação operacional de `status_presenca` define `evento_notificacao = falta_registrada` (`ausente`).
- **Classificação geral×operacional (L-03):** `ausente` ⇒ conta ausência, dispara remarcação. `justificado` ⇒ **somente histórico** (não conta presença, não conta ausência, não remarca, não notifica) — antes esse status existia sem tratamento operacional definido.
- **Efeito na fila:** `falta_registrada` imediato, dedupe por `presenca_id:data`.
- **Auditoria:** mesma cobertura de EVT-03.
- **Invariantes:** INV-ARQ-001/002/003, INV-SEG-003, INV-PRES-001/002/003.
- **Status:** ✅ — L-03 resolvido.

### EVT-05 — Sessão cancelada
- **Gatilho real:** `fn_notif_sessao()` em `UPDATE` quando `status` deixa de ser `agendado`.
- **Efeito na agenda:** sessão deixa de ser válida (status já alterado).
- **Efeito na fila:** lembretes/confirmações pendentes da sessão → `cancelado` (`sessao_cancelada`/`sessao_substituida`/`sessao_nao_agendada`), registrados em `notificacoes_log`. Se cancelamento "real" (não via exceção) → enfileira `cancelamento`. **Promove a próxima sessão real** do vínculo (`fn_promover_proxima_sessao`).
- **Efeito no dispatch:** itens cancelados nunca são enviados.
- **Invariantes:** INV-AGD-004, INV-FILA-002, INV-FILA-006, INV-AGD-002.
- **Status:** ✅

### EVT-06 — Sessão remarcada
- **Gatilho real:** `fn_notif_sessao()` em `UPDATE` com `status = 'agendado'` e mudança de `data_sessao`/`horario`.
- **Efeito na fila:** invalida lembrete da versão anterior (dedupe por `id:data`), enfileira `remarcacao` (exceto em contexto de exceção), e **só re-enfileira** o lembrete se a nova sessão continuar sendo a próxima real.
- **Invariantes:** INV-AGD-003, INV-EXC-001, INV-FILA-002, INV-FILA-006.
- **Status:** ✅

### EVT-07 — Exceção operacional (cancelamento ou remarcação)
- **Gatilho real:** `fn_processar_excecao_notificacoes(excecao_id)` (RPC, chamada manual/cron).
- **Pré-condições:** exceção ativa **e** kill switch `excecao_notificacao_ativa = true` (contenção rápida; se off → `{contido: rollout_pausado}`).
- **Efeito na agenda:** aplica efeito **real** por alvo de `fn_excecao_alvos` — cancela ou remarca em `agenda_tratamentos_assistido`, `entrevistas_fraternas` ou `sessoes_publicas`.
- **Efeito na fila:** enfileira evento dedicado (`*_cancelado/remarcado_por_excecao`) com dedupe `evento:compromisso:excecao` (idempotente). Usa `app.excecao_ctx = 1` para **evitar duplicar** o `cancelamento`/`remarcacao` que os triggers gerariam.
- **Efeito na Central:** itens aparecem com `motivo_origem = excecao_operacional`.
- **Efeito na auditoria:** `audit_logs` (`PROCESSAR_NOTIFICACAO`) com alvos e fallback por nome.
- **Invariantes:** INV-AGD-005, INV-EXC-001, INV-EXC-002, INV-EXC-003, INV-SEG-003, INV-GOV-003.
- **Status:** ✅

### EVT-08 — Entrevista criada / lembrete de entrevista
- **Gatilho real:** `fn_notif_entrevista()` em `entrevistas_fraternas`.
- **Efeito na fila (INSERT):** `entrevista_criada` imediato **somente se** `fn_confirmacao_entrevista_ativa()` retornar `true` (flag governada `entrevista_confirmacao_agendamento_ativa`, default `true`) + `entrevista_lembrete` em `data − 24h` (sempre). Campo `data` é **date-only** (meia-noite UTC).
- **Remarcação/cancelamento (UPDATE):** invalida lembrete antigo (epoch na dedupe), enfileira `remarcacao`/`cancelamento` e re-agenda lembrete da nova data.
- **Efeito no dispatch:** `fn_fila_motivo_inelegivel` barra `entrevista_cancelada`, `entrevista_remarcada`, `entrevista_vencida`. Renderização **não inventa horário** para date-only.
- **Invariantes:** INV-TEMPO-001, INV-TEMPO-002, INV-TEMPO-003, INV-AGD-003, INV-EXC-001, INV-FILA-006, INV-GOV-001, INV-GOV-002, INV-GOV-003.
- **Status:** ✅ — confirmação imediata agora é governada (L-01) pela flag `entrevista_confirmacao_agendamento_ativa` (default `true` preserva o comportamento atual); lembrete de 24h inalterado.

### EVT-09 — Mensagem manual
- **Gatilho real:** `fn_enfileirar_mensagem_manual(assistido, mensagem, obs)` (RPC).
- **Pré-condições:** permissão `admin`/`administrador_master`; mensagem não vazia ≤1000 chars; destinatário com telefone válido; respeita opt-out **sem alterá-lo**.
- **Efeito na fila:** item `mensagem_manual` `pendente`, dedupe único `manual:<uuid>`, payload com `origem_manual`, `enviado_por`.
- **Efeito no dispatch:** envia o **texto cru** (sem template); passa por opt-out, janela e limite diário como qualquer item.
- **Efeito na auditoria:** `notificacoes_log` + `audit_logs` (`enfileirar_mensagem_manual`).
- **Invariantes:** INV-MANUAL-001, INV-MANUAL-002, INV-ARQ-001, INV-ARQ-003, INV-ARQ-004, INV-SEG-001, INV-SEG-002.
- **Status:** ✅ — L-02 implementado: a Central agora exibe o diagnóstico de pendência (aguardando janela / aguardando limite diário / pendente normal / bloqueado) via `fn_fila_diagnostico_pendentes`. Pendência aberta apenas a decisão de negócio sobre isenção do limite diário para manual (ver backlog).

### EVT-10 — Encerramento de item por erro de cadastro
- **Gatilho real:** `fn_encerrar_item_fila_erro_cadastro(fila_id, motivo, obs)` (RPC).
- **Pré-condições:** permissão admin; item existente; **não** enviado/cancelado; `erro` atual ∈ {`sem_telefone`, `telefone_invalido`, `dados_obrigatorios_ausentes`, `nome_ausente`}.
- **Efeito na fila:** **apenas o item atual** → `cancelado` (`erro_cadastro`), com bloco `encerramento` no payload.
- **Não altera:** preferências, opt-out, consentimento — **não bloqueia** a pessoa.
- **Efeito na auditoria:** `notificacoes_log` + `audit_logs` (`encerrar_item_fila_erro_cadastro`).
- **Invariantes:** INV-MANUAL-003, INV-ARQ-003, INV-ARQ-004, INV-SEG-001, INV-SEG-002.
- **Status:** ✅

### EVT-11 — Alteração de flag / parâmetro crítico
- **Gatilho real:** `fn_atualizar_parametro_operacional(chave, valor, obs)` (RPC) via página de Governança de Parâmetros.
- **Pré-condições:** permissão admin; parâmetro `governavel`; validação de tipo/faixa (`booleano`/`inteiro` com `valor_min/max`/`enum`/`json`).
- **Efeito colateral:** muda comportamento de eventos dependentes — `tratamento_lembrete_antecedencia_horas` (EVT-01/02), `tratamento_confirmacao_agendamento_ativa` (EVT-01), `excecao_notificacao_ativa` (EVT-07, kill switch).
- **Efeito na auditoria:** `audit_logs` (`atualizar_parametro_operacional`) com valor anterior e novo.
- **Invariantes:** INV-GOV-001, INV-GOV-002, INV-GOV-003, INV-ARQ-004, INV-SEG-001, INV-SEG-002.
- **Status:** ✅

### EVT-12 — Saneamento da fila (rotina de consistência)
- **Gatilho real:** `fn_sanear_fila_notificacoes()` (RPC/cron).
- **Efeito na fila:** cancela itens `sessao_lembrete`/`sessao_criada` pendentes/agendados que ficaram inelegíveis (`fn_fila_motivo_inelegivel`), com log.
- **Invariantes:** INV-FILA-001, INV-FILA-002, INV-FILA-006, INV-GOV-002.
- **Status:** ✅ — 🟡 cobre apenas sessões; entrevistas dependem da trava do dispatch (ver L-04).

---

## 2. Relatório de aderência

### Já aderente (✅)
- Agenda real como fonte da próxima sessão e **um único lembrete por vínculo** (EVT-01, EVT-02, EVT-05, EVT-06; `fn_proxima_sessao_vinculo` + `fn_promover_proxima_sessao` + dedupe).
- Plano previsto **não** gera lembrete (EVT-01 via `fn_eh_proxima_sessao`).
- Antecedência oficial 24h e confirmação antecipada de tratamento **desligada por padrão** (EVT-01, EVT-11).
- Remarcação invalida a sessão anterior e o lembrete antigo (EVT-06).
- Cancelamento invalida operacionalmente e promove a próxima (EVT-05).
- Exceção aplica efeito **real** na agenda, é idempotente e tem kill switch (EVT-07).
- Dispatch é trava final com motivos explícitos (EVT-02, EVT-08; `fn_fila_motivo_inelegivel`).
- Date-only de entrevista não inventa horário (EVT-08; render no dispatch).
- Mensagem manual pelo pipeline oficial, sem alterar opt-out (EVT-09).
- Encerrar item não bloqueia a pessoa (EVT-10).
- Parâmetros governados com validação e auditoria (EVT-11).

### Parcialmente aderente (🟡)
- **EVT-09** — mensagem manual sujeita a janela e limite diário; pode ficar `ignorado`/atrasada sem sinal claro na UI.

### Lacunas encontradas (🔴/🟡 — comportamento desejado a decidir)
- **L-01** ✅ *(concluído)* — Confirmação imediata de **entrevista** agora sob flag governada `entrevista_confirmacao_agendamento_ativa` (default `true`), lida por `fn_confirmacao_entrevista_ativa()` em `fn_notif_entrevista()`. Simétrica a `tratamento_confirmacao_agendamento_ativa`.
- **L-02** ✅ *(concluído — ver [BACKLOG-GOVERNANCA.md](./BACKLOG-GOVERNANCA.md))* — Mensagem manual/automática sem feedback explícito quando segurada por janela/limite. *Entregue:* `fn_fila_diagnostico_pendentes` + diagnóstico visível na Central. Resta apenas decisão de negócio sobre isenção de limite para envio manual.
- **L-03** ✅ *(concluído)* — Classificação geral×operacional de presença consolidada na fonte única `fn_presenca_classificacao` (backend) + `src/lib/presencaClassificacao.ts` (frontend). `justificado` formalizado como **somente histórico**. Auditoria confirmada via `trg_audit_presencas`. `presenca_registrada`/`falta_registrada` mantidos como **operacional** (decisão explícita).
- **L-04** — `fn_sanear_fila_notificacoes` cobre só sessões. *Desejado:* estender saneamento proativo a entrevistas (hoje só barradas no dispatch).

Nenhuma das lacunas representa envio indevido conhecido — todas são oportunidades de governança/observabilidade, não defeitos de segurança.

---

## 3. Recomendações práticas (priorizadas)

> As lacunas estão formalizadas como backlog rastreável em
> [BACKLOG-GOVERNANCA.md](./BACKLOG-GOVERNANCA.md). Ordem acordada: L-02 (✅) → L-01 (✅) → L-03 → L-04.

1. **(Alta)** L-02 — ✅ Concluído: Central expõe o motivo de itens não enviados (janela/limite/bloqueio). Resta decidir política de isenção de limite para manual.
2. **(Média)** L-01 — ✅ Concluído: flag governada `entrevista_confirmacao_agendamento_ativa` alinha EVT-08 a EVT-01.
3. **(Média)** L-03 — ✅ Concluído: fonte única `fn_presenca_classificacao` separa classificação geral×operacional; auditoria confirmada.
4. **(Baixa)** L-04 — Estender o saneamento da fila a entrevistas para consistência simétrica com sessões.

---

## 4. Como usar esta matriz no ciclo do projeto

- **Revisão de plano:** localizar os eventos impactados (EVT-xx) e verificar se o plano preserva os efeitos colaterais e as invariantes listadas.
- **Revisão de entrega:** para cada evento tocado, confrontar agenda × fila × dispatch × auditoria com a linha correspondente.
- **Testes:** transformar cada efeito colateral em asserção (ex.: "remarcação cancela lembrete antigo e mantém só um lembrete da nova data").
- **Auditoria de regressão:** se um comportamento mudar, atualizar a linha do evento **e** registrar a justificativa.
- **Onboarding técnico:** ponto único de entrada para entender o que cada evento dispara.

## 5. Regra de manutenção

Documento vivo. Atualizar sempre que: surgir novo evento estrutural, um efeito colateral
mudar, uma lacuna for resolvida, ou uma invariante for refinada. Nada estruturalmente
relevante deve ficar apenas em relatórios antigos — eventos e efeitos precisam estar
**explícitos, confrontados com o backend e testáveis**.
