# Consolidação da Central de IA — plano incremental

## Situação atual (já existe, não será refeito)
- **Schema completo**: `ia_queixas`, `ia_queixa_tratamento`, `ia_sugestoes`, `ia_feedback`, `ia_biblioteca`, `ia_biblioteca_relacoes`, `ia_configuracoes` — todas as colunas exigidas pelas Ondas 1–3 já estão lá.
- **UI completa**: as 6 abas em `CentralIA.tsx` (Queixas/Tratamentos, Biblioteca, Sugestões, Feedback, Indicadores, Configurações).
- **Edge function `assistente-entrevista`**: já lê configurações, queixas, vínculos e biblioteca e monta o prompt.
- **Auditoria parcial**: triggers em queixas, queixa_tratamento, biblioteca e configurações.

## Lacuna central (o que realmente falta)
O ciclo supervisionado está **aberto**:
- A IA devolve só texto markdown livre; **nada é gravado em `ia_sugestoes`**.
- Como `ia_sugestoes` fica vazio, **Feedback e Indicadores não têm dados reais**.
- O diálogo da entrevista (`AssistenteIaDialog`) só exibe texto — sem aceitar/ajustar/rejeitar nem registrar a decisão final.
- Sem trigger de auditoria em `ia_sugestoes`/`ia_feedback` (quem avaliou).

O foco da consolidação é **fechar esse ciclo** mantendo a regra: IA é apoio, decisão é humana.

## Trabalho proposto

### Onda A — Sugestão estruturada + persistência (núcleo)
- Alterar `assistente-entrevista` para retornar, além do texto, um JSON estruturado (queixas identificadas, tratamentos sugeridos com quantidade, justificativa, materiais consultados) usando saída estruturada do modelo.
- Persistir cada análise em `ia_sugestoes` (resumo, queixas/tratamentos/quantidades JSON, justificativa, materiais, `status='pendente'`, vínculo a entrevista/assistido/entrevistador).
- Retornar o `id` da sugestão ao cliente para ligar à decisão final.

### Onda B — Integração supervisionada na entrevista (Onda 4 do pedido)
- Evoluir `AssistenteIaDialog` para mostrar a sugestão estruturada com ações **aceitar / ajustar / rejeitar** por tratamento, sem autoatribuição e sem poluição visual.
- Ao aceitar/ajustar, pré-preencher os tratamentos/quantidades já existentes no fluxo (sem mudar a regra de negócio de agendamento).
- Ao salvar a entrevista, registrar a **decisão final** e disparar `ia_feedback` (classificação + diferenças sugerido×atribuído) — opcionalmente exigido conforme `exigir_feedback`.

### Onda C — Indicadores com dados reais
- Camada `services/ia` + hook para métricas: total com IA, aderência total/parcial, divergência, tratamentos mais sugeridos×atribuídos, queixas com maior acerto/divergência, evolução no tempo.
- Reaproveitar/atualizar `IndicadoresAssertividade.tsx` para consumir esses dados (cards + gráficos + tabela comparativa).

### Onda D — Auditoria, permissões e testes
- Migration: trigger de auditoria em `ia_sugestoes` e `ia_feedback`.
- Conferir permissões (admin total; entrevistador usa IA + feedback; demais sem acesso à administração da IA) em rotas e RLS.
- Testes unitários: cálculo de aderência/divergência, classificação de feedback e agregação dos indicadores.

## Detalhes técnicos
- Arquitetura nova: `src/types/ia.ts`, `src/services/ia/*`, `src/hooks/use*`, componentes focados.
- Saída estruturada via Lovable AI Gateway (tool/JSON) com fallback para texto se o modelo não retornar JSON válido.
- Nenhuma alteração nas regras de agendamento (`agenda_tratamentos_assistido` permanece fonte única) nem nos fluxos de tratamentos/relatórios.
- Migrations apenas para triggers de auditoria (sem mudança destrutiva de schema).

## Critérios de aceite
Mapeiam 1:1 os do pedido: base de queixas, relação queixa↔tratamento, registro de sugestão, registro de decisão humana, feedback supervisionado, indicadores de assertividade, biblioteca utilizável, IA integrada de forma supervisionada, tudo auditável, sem regressão.

## Confirmação
Como o módulo já existe e a Onda B altera o fluxo consolidado de entrevista, quero confirmar antes de codar:
1. Posso evoluir o ciclo nesta ordem (A→B→C→D)?
2. O feedback no fim da entrevista deve ser **obrigatório** (respeitando `exigir_feedback`) ou sempre opcional?
