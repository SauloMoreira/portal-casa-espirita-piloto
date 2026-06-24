# Catálogo de Invariantes do Sistema

> Documento oficial e **vivo**. Registra as regras estruturais que devem permanecer
> **sempre verdadeiras**, independentemente de novas funcionalidades, correções ou
> refatorações.

## Finalidade

Este catálogo serve para:

- proteger a arquitetura do sistema
- evitar regressões silenciosas
- orientar desenvolvimento, revisão e testes
- alinhar backend, frontend, fila, dispatch, auditoria e operação
- funcionar como referência oficial para prompts, homologações e monitoramento

## Regra de uso

Toda mudança relevante no sistema deve ser confrontada com este catálogo.

**Pergunta obrigatória em cada frente:**

> Esta implementação preserva as invariantes do sistema?

Se a resposta for **"não"**, a entrega **não está pronta**.

---

## 1. Invariantes de arquitetura

### INV-ARQ-001 — Backend é a fonte de verdade
Toda regra crítica de negócio deve viver no backend, em serviço oficial, função/RPC
oficial ou regra centralizada equivalente.

**Implica**
- frontend não decide regra crítica
- frontend não valida sozinho sem revalidação no backend
- dispatch não depende da UI para saber o que fazer

**Não pode acontecer**
- regra de negócio sensível existir apenas no componente visual
- frontend atualizar estado crítico diretamente sem backend oficial

### INV-ARQ-002 — UI não implementa lógica paralela
A interface apenas: apresenta, coleta entrada, chama serviço oficial e mostra resultado.

**Não pode acontecer**
- a UI recalcular elegibilidade de forma independente
- a UI manter uma "segunda regra" diferente da fonte oficial
- a UI simular estado operacional sem respaldo no backend

### INV-ARQ-003 — Toda ação sensível deve ser auditável
Qualquer ação que altere agenda, fila, envio de mensagem, exceção operacional,
parâmetro crítico ou status relevante deve deixar trilha auditável.

**Não pode acontecer**
- alteração sensível sem auditoria
- ação manual invisível
- mudança estrutural sem rastreabilidade

### INV-ARQ-004 — Ações sensíveis devem ter permissão validada no backend
Permissão não pode ser apenas um detalhe da UI.

**Implica**
- backend valida perfil/papel
- esconder botão não basta
- RPC/função crítica protege o sistema

---

## 2. Invariantes de agenda e tratamento

### INV-AGD-001 — Agenda real é a fonte operacional da próxima sessão
O sistema pode conhecer o plano previsto, mas a operação se baseia na agenda real atual.

**Implica** — comparecimento, cancelamento, remarcação, lembrete e exceção operacional
sempre atuam sobre o compromisso real válido.

**Não pode acontecer**
- plano previsto ser tratado como agenda operacional
- sessão prevista ser tratada como compromisso já agendado

### INV-AGD-002 — Um vínculo só pode ter uma próxima sessão real válida por vez
Para cada vínculo de tratamento, só pode existir uma sessão real atual válida como
próxima sessão operacional.

**Não pode acontecer**
- múltiplas próximas sessões reais válidas para o mesmo vínculo
- ambiguidade sobre qual é a próxima sessão

### INV-AGD-003 — Remarcação invalida a sessão anterior
Quando uma sessão é remarcada, a sessão anterior deixa de ser a sessão válida.

**Implica**
- a agenda deve refletir a nova sessão válida
- a comunicação anterior deve ser invalidada
- o dispatch não pode continuar tratando a antiga como elegível

**Não pode acontecer**
- sessão antiga e nova coexistirem como válidas
- lembrete antigo permanecer ativo após remarcação

### INV-AGD-004 — Cancelamento invalida operacionalmente a sessão
Se uma sessão for cancelada: ela deixa de ser operacionalmente válida, não pode
permanecer como agendada e não pode continuar elegível para lembrete/envio.

### INV-AGD-005 — Exceção operacional deve refletir efeito real na agenda
Se uma exceção cancela → o compromisso deve ser cancelado de verdade.
Se uma exceção remarca → o compromisso deve ser movido/remarcado de verdade.

**Não pode acontecer**
- exceção só "mandar mensagem"
- agenda continuar dizendo uma coisa e comunicação outra

---

## 3. Invariantes de fila e notificações

### INV-FILA-001 — A fila deve refletir apenas compromissos reais válidos
`notificacoes_fila` não pode representar cadeia futura prevista como se fosse agenda atual.

**Implica**
- só entram itens que representem compromisso real elegível
- plano previsto não gera fila automaticamente por si só

### INV-FILA-002 — Um único lembrete válido por vínculo
Para tratamento, deve existir no máximo um lembrete ativo por vínculo, apontando para a
próxima sessão real válida.

**Não pode acontecer**
- dois lembretes ativos para o mesmo vínculo
- lembrete de cadeia futura
- lembrete de sessão superada

### INV-FILA-003 — Sessão prevista não gera lembrete
Sessão apenas prevista no plano não pode gerar `sessao_lembrete`.
Lembrete nasce de: sessão real efetivamente agendada, próxima sessão válida e
antecedência oficial configurada.

### INV-FILA-004 — Lembrete de tratamento deve respeitar antecedência oficial
Por padrão, o tratamento deve gerar lembrete com a antecedência oficial definida.

**Política atual da casa**
- `default = 24 horas antes` (`tratamento_lembrete_antecedencia_horas`)
- tratamento não deve enviar confirmação antecipada por padrão

### INV-FILA-005 — Confirmação antecipada de tratamento só pode existir se explicitamente habilitada
Se houver suporte a confirmação imediata de agendamento para tratamento, isso deve
depender de flag oficial governada.

**Política atual**
- `tratamento_confirmacao_agendamento_ativa = desligado por padrão`

**Não pode acontecer**
- confirmação imediata ser disparada implicitamente
- tratamento distante gerar mensagem fora da política da casa

### INV-FILA-006 — Itens inválidos devem deixar de ser elegíveis antes do envio
O dispatch deve atuar como **trava final**. Deve barrar:
- sessão cancelada
- sessão substituída
- sessão não agendada
- sessão vencida
- sessão futura que não seja a próxima
- entrevista inválida/cancelada/remarcada/vencida
- destinatário sem consentimento/telefone

---

## 4. Invariantes de entrevistas e semântica temporal

### INV-TEMPO-001 — Entrevista date-only não pode inventar horário
Se a entrevista for registrada como data pura (date-only), a comunicação deve mostrar
apenas a data.

**Não pode acontecer**
- converter meia-noite UTC em horário local fantasma
- aparecer 21:00 ou outro horário inexistente
- deslocar o dia por vazamento de fuso

### INV-TEMPO-002 — Data pura deve continuar sendo data pura
Campos conceitualmente date-only não podem ser tratados como datetime real só porque
foram serializados como timestamp.

### INV-TEMPO-003 — Só converter fuso quando existir hora real
Conversão para timezone oficial só deve ocorrer quando o campo representa um compromisso
com hora real.

---

## 5. Invariantes de mensagem manual e ações humanas

### INV-MANUAL-001 — Mensagem manual passa pelo pipeline oficial
Mensagem manual nunca pode sair diretamente do frontend para o provider.
Deve passar por: fila oficial, dispatch oficial, log, auditoria e validação de
telefone/consentimento.

### INV-MANUAL-002 — Mensagem manual não altera consentimento nem opt-out
Enviar mensagem manual não pode: ativar ou alterar `opt_out`, alterar consentimento ou
bloquear futuras mensagens automáticas.

### INV-MANUAL-003 — Ação sobre item da fila não pode bloquear a pessoa
Encerrar um item por erro de cadastro atua sobre o item atual, não sobre o destinatário.

**Não pode acontecer**
- encerramento do item bloquear futuras mensagens
- erro da ocorrência virar bloqueio permanente do assistido

---

## 6. Invariantes de exceção operacional

### INV-EXC-001 — Cancelamento e remarcação são eventos distintos
O sistema deve tratar separadamente cancelamento e remarcação.

**Não pode acontecer**
- usar cancelamento quando houve remarcação
- fingir remarcação sem nova data válida

### INV-EXC-002 — Público sem alvo rastreável não notifica
Atividade pública só pode gerar notificação se houver público-alvo rastreável e elegível.

**Não pode acontecer**
- disparo cego
- notificar "todo mundo"
- inferir destinatário sem base oficial

### INV-EXC-003 — Exceção só afeta o que realmente está no escopo
Uma exceção não pode cancelar/remarcar itens fora do seu escopo real.

**Não pode acontecer**
- tocar outros dias sem base oficial
- tocar cadeia futura indevida
- atingir compromissos não relacionados à exceção

---

## 7. Invariantes de segurança e confiabilidade

### INV-SEG-001 — Funções críticas devem ser protegidas
Funções sensíveis no banco devem seguir o padrão seguro do projeto:
- `SECURITY DEFINER`
- `SET search_path = public`
- validação de permissão
- validação de entrada
- auditoria quando aplicável

### INV-SEG-002 — Toda ação manual sensível precisa de confirmação explícita
Nada de ação humana crítica acontecer por clique acidental.

### INV-SEG-003 — Idempotência deve existir em ações críticas
Processamentos repetidos não podem: duplicar envio, duplicar remarcação, duplicar
cancelamento ou criar múltiplos itens equivalentes.

---

## 7b. Invariantes de presença (classificação geral × operacional)

### INV-PRES-001 — Classificação geral é separada da classificação operacional
`presencas_tratamentos.status_presenca` é a classificação **geral** (leitura humana/
histórica). A classificação **operacional** (conta presença, conta ausência, dispara
remarcação, avança sessão, somente histórico) NÃO é o mesmo dado: é derivada. As duas
leituras não podem entrar em conflito.

### INV-PRES-002 — Fonte única da classificação operacional
A semântica operacional de cada `status_presenca` vem de UMA fonte oficial:
`fn_presenca_classificacao` (backend, fonte de verdade) espelhada em
`src/lib/presencaClassificacao.ts` (frontend). Proibido inferir por `if` solto
(`status === 'presente'`) em UI ou service. `justificado` é **somente histórico**:
não conta presença, não conta ausência válida, não remarca e não notifica.

### INV-PRES-003 — Toda escrita em presença é auditável
Inserção/alteração em `presencas_tratamentos` deve deixar trilha suficiente (quem,
quando, registro, valor anterior e novo) via `trg_audit_presencas`/`fn_audit_trigger`,
além do registro de efeito operacional (`PLANO_PRESENCA_AVANCO`) quando aplicável.

---

## 8. Invariantes de governança operacional

### INV-GOV-001 — Flags e parâmetros críticos devem ser governados
Parâmetros sensíveis devem ter: dono claro, permissão de alteração, auditoria,
descrição funcional, valor atual e impacto operacional visível.

### INV-GOV-002 — Toda mudança crítica deve ser observável
Mudança relevante no sistema deve poder ser monitorada operacionalmente.

### INV-GOV-003 — Toda frente crítica deve ter possibilidade de contenção
Fluxos que mexem com agenda, fila, dispatch e comunicação devem ter estratégia clara de
rollout, contenção e rollback operacional, quando aplicável.

---

## 9. Como usar este catálogo

**Em revisão de plano** — Sempre verificar:
- o plano respeita as invariantes?
- alguma invariante foi ignorada ou ameaçada?
- há risco de lógica paralela?
- há risco de regressão estrutural?

**Em revisão de entrega** — Perguntar:
- a implementação preservou as invariantes?
- os testes cobrem as invariantes atingidas?
- a operação continua coerente?

**Em testes** — Criar testes específicos para garantir que as invariantes continuem
verdadeiras.

---

## 10. Regra de manutenção

Este catálogo é um documento vivo. Deve ser atualizado quando:
- nova regra estrutural surgir
- alguma invariante precisar ser refinada
- arquitetura evoluir
- risco recorrente virar regra formal
- nova frente crítica alterar o comportamento central do sistema

**Regra final** — Nada que seja estruturalmente importante deve ficar só "na cabeça" ou
espalhado em relatórios antigos. As invariantes do sistema precisam estar **explícitas,
visíveis e testáveis**.
