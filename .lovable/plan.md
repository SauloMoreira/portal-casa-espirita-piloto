# Fase 5 — Métricas, Observabilidade e Calibração Contínua da IA (WhatsApp)

Objetivo: tornar a evolução da IA conversacional do WhatsApp **mensurável, auditável, calibrável e continuamente aprimorável**, sem nova arquitetura, sem custo novo relevante de LLM e sem alterar o comportamento estável das Fases 1, 2 e 4. Cria uma camada operacional que transforma erros, ambiguidades, fallbacks e handoffs reais em insumos organizados para melhoria futura — com baixo risco, baixo custo e alta governança.

A telemetria já é coletada hoje em `notificacoes_log` (JSONB) e `whatsapp_handoffs`. A Fase 5 **agrega, exibe, organiza por padrões e qualifica** — sem mudar o que é gravado, salvo padronização leve e segura de rótulos.

## Dados já disponíveis (sem mudança de comportamento)
- `notificacoes_log` entrada (`payload_recebido`): `intencao`, `escopo`, `assistido_identificado`, `fallback_motivo`, `resposta_fonte`, `classificador_hibrido`, `confianca_classificacao`, `texto`.
- `notificacoes_log` saída (`payload_enviado`): `autor`, `usou_llm`, `mensagem`.
- `whatsapp_handoffs`: `motivo`, `classificado_por_ia`, `status`, `origem`, `created_at`.

## Entregáveis

### 1. RPC agregadora (server-side, SECURITY DEFINER)
`public.metricas_ia_whatsapp(p_inicio timestamptz, p_fim timestamptz) RETURNS jsonb` — agregação no banco, padrão de `dashboard_admin` / `painel_whatsapp`. `search_path = public`; checagem interna `has_role(auth.uid(),'admin')` que, se falhar, **lança erro controlado de permissão** (não retorna payload especial); `GRANT EXECUTE TO authenticated`. JSON consolidado e estável:
- **A. Volume:** mensagens recebidas, respostas da IA, conversas distintas.
- **B. Handoff:** total, % sobre mensagens, top motivos, total `classificado_por_ia`, distribuição por status (se barato).
- **C. Classificação:** top intents, % resolvido sem fallback, top `fallback_motivo`, top mensagens `complexo`.
- **D. Híbrido:** turnos com `classificador_hibrido = true`, % sobre total, confiança média, nº respostas `usou_llm = true`.
- **E. Escopo:** distribuição público / pessoal / ambíguo; % perguntas pessoais sem identificação confiável.
- **F. Ambiguidades/erros:** mensagens mais frequentes que caíram em `complexo`, geraram fallback, geraram handoff ou tiveram baixa confiança no híbrido — com **texto truncado**, frequência, classificação associada e categoria derivada (quando houver).
- **G. Comparação temporal:** feita por **segunda chamada da própria RPC** para a janela anterior equivalente — a função principal não duplica lógica; o FE calcula as variações (volume, handoff, fallback, híbrido, resolução sem fallback).

**Limites:** trabalhar apenas com períodos pré-definidos (7 / 30 / 90 dias); top-N limitado para evitar payload excessivo — preferência **top 10**, no máximo **top 20** onde fizer sentido.

### 2. Nova aba "IA WhatsApp" na Central de IA
`src/pages/CentralIA.tsx`: novo `TabsTrigger` "IA WhatsApp" (admin-only) + `src/components/central-ia/MetricasWhatsApp.tsx`. Interface leve, reusando cards/tabelas e tokens existentes — **sem nova lib de gráficos**:
- Seletor de período (7 / 30 / 90 dias).
- KPIs em cards: mensagens recebidas, % handoff, % resolvido sem fallback, % híbrido acionado, nº respostas com LLM — cada um com **valor atual + delta vs período anterior**.
- Tabelas simples: top intents, top motivos de handoff, top fallback, top mensagens `complexo`, top ambiguidades.

### 3. Bloco de Calibração / Oportunidades de Melhoria
Na mesma aba, bloco que organiza o erro em **padrões úteis**: top ambiguidades recorrentes; top mensagens que escaparam para `complexo`; top handoffs potencialmente evitáveis; top falhas em perguntas públicas e pessoais; top padrões de erro temporal; top termos com erro de digitação recorrente; top falhas de desambiguação público×pessoal. Ajuda a decidir o que vira regra, melhoria de classificação, vocabulário, caso de teste, ajuste de prompt grounded ou revisão de handoff.

### 4. Agrupamento determinístico de padrões de falha (sem ML)
Lógica determinística em `src/lib/whatsappMetricas.ts` agrupando por similaridade funcional: erro temporal; erro de atividade/entidade; pergunta pessoal sem identificação; mensagem curta ambígua; erro de digitação fora do dicionário; handoff repetido pela mesma causa; fallback por baixa confiança; falha de desambiguação público×pessoal. Fonte: combinação de `intencao`, `escopo`, `fallback_motivo`, `motivo`, palavras-chave e forma da mensagem. Determinístico, operacional e assistido — não estatística avançada nem clusterização real.

### 5. Backlog inteligente de melhoria
Visão derivada dos agrupamentos, cada item com: **categoria · frequência · impacto percebido · sugestão de frente de correção**. **Impacto** por regra simples e previsível: combinação de frequência + associação a handoff/fallback, classificado em **baixo / médio / alto** (sem score sofisticado). Ex.: "perguntas curtas sobre datas → revisar herança temporal"; "desobsessão caindo em complexo → ampliar vocabulário/entidade"; "handoff após pergunta pública simples → revisar classificação"; "falhas em ação social → revisar orquestrador institucional". Camada simples de leitura/priorização humana, sem automação pesada nem autoajuste.

### 6. Base para calibração futura
Agrupamentos e backlog desenhados para, depois, alimentarem: novos casos de teste, expansão de vocabulário, refino do classificador e do payload grounded, melhorias de prompt, revisão das regras de handoff e da retenção antes do handoff. Sem prometer autoaprendizado — base para aprendizado operacional assistido e controlado.

### 7. Refino mínimo e seguro de calibração
Em `whatsapp-inbound`: apenas normalização leve de rótulos de `motivo` de handoff e de `fallback_motivo` (padronização de strings) para melhorar o agrupamento. **Sem alterar gatilhos**, sem mudar quando o handoff dispara, sem tocar nas Fases 1, 2 e 4, sem abrir novos fluxos.

## Detalhes técnicos
```text
DB:   metricas_ia_whatsapp(p_inicio, p_fim) RETURNS jsonb  (SECURITY DEFINER, search_path=public)
      -> agrega notificacoes_log (payload->>...) + whatsapp_handoffs
      -> has_role(auth.uid(),'admin') interno (erro de permissão se falhar)
      -> GRANT EXECUTE TO authenticated; top-N 10 (máx 20)
FE:   CentralIA.tsx -> +1 TabsTrigger "IA WhatsApp" (isAdmin)
      components/central-ia/MetricasWhatsApp.tsx -> 2 chamadas RPC (atual + anterior),
      KPIs com delta, top-N, calibração e backlog
LIB:  lib/whatsappMetricas.ts (+ .test.ts) -> helpers puros: formatação, ranking, comparação,
      agrupamento de padrões, categorização de falha, impacto (baixo/médio/alto), insights e backlog
Edge: whatsapp-inbound -> só normalização de rótulos de handoff/fallback (sem mudar gatilhos)
```

## Segurança e performance
- **Segurança:** só admin acessa a aba; RPC lança erro de permissão para não-admin; mensagens exibidas sempre **truncadas**, sem expor conteúdo sensível desnecessário; isolamento lógico mantido.
- **Performance:** agregação no banco; sem trazer massa bruta ao FE; sem processamento pesado no cliente; RPC simples e previsível.

## Testes
- **Puros** (`whatsappMetricas.ts` + `.test.ts`): percentuais, ranking top-N, truncamento de texto, agrupamento de padrões, categorização de falha, regra de impacto, geração do bloco de calibração e do backlog.
- **Integração leve:** RPC retorna a estrutura esperada; aba exibe os dados; comparação com período anterior funciona; calibração e backlog aparecem corretamente.
- **Segurança:** somente admin acessa a aba; RPC não devolve dados a usuários sem autorização; sem quebra de isolamento.
- **Não regressão:** suíte completa (517 testes) passando; typecheck e build limpos.

## Não-objetivos
Não abrir nova arquitetura · não criar tabelas novas sem necessidade · não adicionar custo de LLM · não virar BI complexo · não alterar comportamento das Fases 1, 2 e 4 · não prometer autoaprendizado · não abrir automação pesada de priorização.

## Ao concluir
Parar e apresentar relatório com: métricas criadas; como acompanhar o híbrido; como acompanhar erros, ambiguidades, fallbacks e handoffs; como o bloco de calibração orienta a melhoria; exemplos de padrões detectados; backlog gerado; testes executados; confirmação de zero regressão.
