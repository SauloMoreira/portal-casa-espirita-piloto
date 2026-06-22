# Horário obrigatório para tratamentos holísticos (data + hora)

## Princípio
A regra de **dia/frequência/ocorrência permanece intacta**. Esta entrega apenas acrescenta o **horário** como fator operacional para tratamentos holísticos (`tipos_tratamento.tipo = 'holistico'`). Modelo: horário padrão no tipo + horário efetivo por sessão (pode variar por ocorrência). Edição real só em entrevista/agendamento, lista/agenda do coordenador e remarcação; demais telas apenas exibem. **Inegociável:** sem motor paralelo, sem hardcode, sem regressão, sem exigir horário em não holísticos, sem alterar a lógica já homologada de dias.

## 1. Schema (migração compatível e não destrutiva)
- **Plano previsto:** adicionar `plano_tratamento_sessoes.horario_previsto TIME NULL` (horário previsto da etapa; opcional para compatibilidade com legado e não holísticos).
- **Agenda ativa:** manter `agenda_tratamentos_assistido.horario` como horário efetivo da sessão real (já existe).
- **Tipo:** reutilizar `tipos_tratamento.horario` (já existe) como **padrão sugerido do tipo** — não como horário final da sessão. Campo pode existir para todos os tipos, mas só é operacionalmente obrigatório para `tipo = 'holistico'`. **Não criar `horario_padrao`.**
- **RPCs `pts_*`:** atualizar para receber/gravar `horario_previsto` na etapa do plano e `horario` na sessão ativa, e revalidar no backend a obrigatoriedade do horário em holísticos.
- **Compatibilidade:** sem backfill, sem horário inventado; registros antigos podem permanecer nulos.

## 2. Semântica dos horários
- `tipos_tratamento.horario` = padrão sugerido.
- `plano_tratamento_sessoes.horario_previsto` = horário previsto da etapa.
- `agenda_tratamentos_assistido.horario` = horário efetivo da sessão real.
- Normalmente previsto == efetivo; a distinção é preservada para remarcação, saneamento, auditoria e comparação plano↔agenda. Quando o horário efetivo for ajustado, o fluxo oficial mantém o `horario_previsto` consistente, evitando divergência não intencional.

## 3. Detecção única do holístico
- Helper único `isTratamentoHolistico(tipo)` em `src/lib/agendaRules.ts`, baseado em `tipo === 'holistico'`. Todos os pontos usam este helper — sem classificação paralela.

## 4. Motor e orquestração (mínimo necessário)
- `agendaRules.ts`: incluir `horario_previsto` em `PlanoEtapa`; propagar o padrão do tipo ao montar etapas; adicionar validador puro `validarHorarioHolistico({ holistico, horario })`. Dias/frequência/ocorrência inalterados.
- `orquestracao.ts`: incluir `horario_previsto` da etapa e `horario` efetivo da sessão nos payloads; manter o espelhamento plano↔agenda ativa.

## 5. Obrigatoriedade (dois níveis: serviço/UI + backend/RPC)
- **Holístico:** nova sessão → exige horário; remarcação → mantém ou exige; edição → permite alterar. Se `tipos_tratamento.horario` existir, usar como sugestão; gravação final exige horário efetivo válido.
- **Não holístico:** comportamento atual, horário não exigido.
- **Registros antigos:** não quebram produção; permanecem nulos até saneamento, mas sinalizados.

## 6. Pontos de edição e exibição

Edição real:
- **Entrevista/agendamento** (`fazerEntrevista`, `TratamentosSection`, `FazerEntrevista`): ao adicionar holístico, campo de horário obrigatório, pré-preenchido com `tipos_tratamento.horario` quando houver, editável; bloquear confirmação sem horário.
- **Lista/agenda do coordenador** (`CoordenadorTratamentos`, `CoordenadorAgenda`, `CoordenadorListaEspera`): indicador de horário; definir/corrigir horário das sessões holísticas; badge **"Horário pendente"** quando faltar.
- **Remarcação:** preservar regra do dia; manter o horário anterior como sugestão; permitir ajuste; não confirmar holístico sem horário.

Apenas exibição (data + hora): `Agenda.tsx`, `Presenca.tsx`, `consultaConsolidada.ts`, `MinhaAgenda`, `MeusTratamentos`, `AssistidoDashboard`, `CartaAgendamento`, notificações/WhatsApp. Quando houver **divergência real** entre plano e sessão, exibir claramente **Horário previsto** vs **Horário agendado**; sem divergência, não duplicar a informação.

## 7. Registros antigos sem horário
- UI: badge **"Horário pendente"** + ação explícita para definir; nunca tratar como sessão completa.
- Notificações: holístico sem horário → não montar mensagem com hora vazia; fallback seguro ou omitir o trecho. Nenhum preenchimento automático.

## 8. Ordenação e apresentação
- `data ASC, horario ASC, NULLS LAST`.
- `NULLS LAST` é só ordenação e **não mascara pendência**: holístico sem horário aparece ao fim **e** fica visualmente destacado como pendente/incompleto.

## 9. Notificações / WhatsApp
- Incluir data + hora em confirmação, ausência, remarcação e próxima sessão (`notificacoesService`, `whatsappOrquestrador`, templates), com fallback seguro quando o horário estiver ausente.

## 10. Testes
Unitários: `isTratamentoHolistico`; `validarHorarioHolistico`; holístico exige horário e não holístico não; remarcação mantém/solicita; normalização/exibição data+hora; ordenação `NULLS LAST`.
Integração: agenda exibe; coordenador exibe e edita; presença exibe; consolidada exibe; notificações incluem horário quando houver; registros antigos não quebram; backend rejeita criação/edição de holístico sem horário.
Compatibilidade/legado: holístico de assistido já convertido permanece consistente entre previsto/efetivo.
Fallback: holístico com horário → notificação envia data+hora; holístico sem horário → template não quebra e não envia hora vazia.
Não regressão: suíte completa verde; agenda não holística intacta; regra de dias intacta; fluxos homologados intactos.

## Relatório final (ao concluir)
Onde o horário entrou no schema; confirmação de reutilização de `tipos_tratamento.horario`; como o holístico é identificado; telas/serviços impactados; criação/edição/remarcação; tratamento dos registros antigos; testes executados; confirmação explícita de ausência de regressão.
