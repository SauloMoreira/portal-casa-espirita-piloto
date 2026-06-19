# Plano de Ação Final — IA Conversacional (Tratamentos FER)

> Plano aprovado em essência. Estes são os ajustes finais de clareza antes da execução.

## 1. Diagnóstico (confirmado no código)

- `whatsapp-inbound` é **100% determinístico** — sem LLM. Classificador por palavra-chave + frases fixas = "FAQ melhorado".
- Memória curta guarda só `contexto_data`, `contexto_atividade`, `ultima_resposta_ia`, `ultimo_contato_em`.
- Cada mensagem é reclassificada do zero (stateless) → perde o fio em sequências.

**Causas:** falta compreensão semântica, falta estado estruturado, geração fixa por intenção, fronteira público/pessoal decidida cedo e sem confiança.

## 2. Arquitetura — IA como orquestradora

```text
[1] Normalização barata (determinística)         já existe (corrigirTexto)
[2] Classificação rápida + confiança             estende classificarIntencao
       baixa/complexo → [2b] Classificador LLM mini SÓ NO GAP (1 chamada barata)
[3] Resolução TEMPORAL explícita (determinística) NOVO — seção 4
[4] Memória curta / herança de contexto          NOVO — seções 8 e 9
[5] Consulta determinística (ordem fixa) → PAYLOAD de fatos  — seções 6 e 7
[6] Geração final humana (LLM redige SOBRE o payload, nunca inventa)
```

Princípio: **o LLM nunca consulta nem inventa fatos.** Só (a) classifica no gap e (b) redige a partir de payload estruturado.

## 3. Fase 0 — Baseline / Observação (ANTES de qualquer mudança)

Fase curta, sem alterar comportamento, só medir o estado atual:
- % de handoff atual; intents mais frequentes; erros/falhas mais frequentes (`fallback_motivo`, `resposta_fonte`); principais falhas (`complexo`).
- Entregável: snapshot documentado, referência para as métricas da seção 15. Sem deploy de lógica.

## 4. Resolução temporal explícita (camada dedicada, ANTES da consulta)

`resolverTempo(texto, contexto, hojeSP)` devolve **sempre** alvo concreto:

```json
{ "tipo": "dia"|"intervalo", "inicio": "2026-06-21", "fim": "2026-06-21",
  "diasSemana": [6,0], "label": "neste fim de semana", "origem": "explicito|herdado|default_hoje" }
```

| Expressão | Resolução |
|---|---|
| hoje / amanhã / depois de amanhã | dia = hoje / +1 / +2 |
| domingo, no sábado, segunda… | próxima ocorrência do dia (offset 0–6) |
| próxima quinta / quinta que vem | ocorrência do dia +7 se cair hoje |
| essa/esta semana | intervalo hoje → próximo domingo |
| fim de semana | intervalo próximo sáb → próximo dom ([6,0]) |
| **sem marcador** | herda `referencia_temporal` (seção 9); senão default = hoje |

Intervalos varrem o range. Fuso fixo `America/Sao_Paulo`.

## 5. Perguntas SEM data explícita ("quando é a evangelhoterapia?") — regra rígida

Ordem fechada:
1. Há contexto temporal recente herdável (seção 9)? → usa essa data.
2. Escopo público (atividade pública nomeada, sem possessivo) → **próxima ocorrência pública** (seção 7, janela 14 dias).
3. Escopo pessoal ("meu/minha" + identificado) → **próximo agendamento pessoal** (seção 7).
4. Escopo pessoal não identificado → pede identificação.
5. Ambíguo (entidade pública e pessoal, sem possessivo/contexto) → pede esclarecimento.

A IA **nunca** assume "próxima ocorrência" solta — só no caso 2/3, com validação da seção 7.

## 6. Precedência fechada entre fontes (regra inequívoca)

```text
1. EXCEÇÃO OPERACIONAL (cancelado/remarcado/excepcional) p/ data+atividade
2. SESSÃO REAL agendada (sessoes_publicas / agenda real do dia)
3. AGENDAMENTO PESSOAL (agenda_tratamentos_assistido) — só escopo pessoal
4. PROGRAMAÇÃO PADRÃO (recorrente por dia da semana)
5. EVENTOS / CAMPANHAS / AÇÃO SOCIAL (papel depende da pergunta — ver abaixo)
6. FALLBACK legado (regras_operacionais JSON)
```

Exceção (1) sempre sobrescreve sessão real e programação padrão para a data/atividade. Sessão real (2) sobrescreve programação padrão (4). Nada abaixo inventa o que está vazio acima.

**Papel de eventos/campanhas/ação social (nível 5):**
- Quando a pergunta principal é sobre **programação/tratamento**, eles entram apenas como **complemento** ("além disso, há o evento X"), nunca substituindo horário de tratamento.
- Quando a pergunta é **explicitamente sobre eventos, campanhas ou ação social** (intenção `eventos`/`campanhas`/`acao_social`), eles passam a ser a **fonte principal** da resposta, e programação/tratamento não interferem.

## 7. PRÓXIMA OCORRÊNCIA com validação obrigatória de exceção (regra explícita)

Aplica-se a TODA pergunta de "próxima ocorrência", pública ou pessoal ("próxima evangelhoterapia?", "próxima desobsessão?", "meu próximo atendimento?", "meu próximo tratamento?").

A IA **não pode** pegar a próxima data cronológica e responder direto. Algoritmo obrigatório:

```text
1. Localizar a PRÓXIMA data candidata da atividade (pública: sessão real ou
   recorrência da programação; pessoal: próxima sessão do assistido).
2. Para essa data+atividade, consultar excecoes_operacionais.
3. Avaliar validade da candidata:
   - cancelado/cancelada   → INVÁLIDA, descartar
   - remarcado/remarcada   → INVÁLIDA como está; usar a NOVA data (nova_data)
                             como nova candidata e revalidar
   - excepcional/alterado  → INVÁLIDA como "próxima normal"; tratar conforme exceção
   - sem exceção/mantido   → VÁLIDA
4. Se INVÁLIDA, AVANÇAR para a próxima candidata e repetir 2–3.
5. Repetir até achar ocorrência REALMENTE VÁLIDA (teto: 8 candidatas ou 60 dias).
6. Só então responder, citando remarcação quando útil
   ("a de 21/06 foi remarcada; a próxima válida é 28/06 às 20h").
7. Se nenhuma candidata válida na janela → ausência honesta em linguagem humana
   (seção 14), oferecendo ajuda/handoff. Nunca inventar.
```

Objetivo: jamais anunciar como "próxima" uma data cancelada, remarcada ou alterada.

## 8. Desambiguação público vs pessoal

3 sinais: (1) possessivos ("meu/minha/tenho") → pessoal; (2) marcadores públicos ("público", "a casa", "tem … hoje?" sem possessivo) → público; (3) identidade + entidade do tratamento do assistido → habilita pessoal.

| Pergunta | Escopo |
|---|---|
| "hoje tem tratamento?" | público |
| "tenho tratamento hoje?" | pessoal (exige identidade) |
| "e a desobsessão?" | herda contexto |
| "quando é a evangelhoterapia?" | público (seção 5) |
| "quando é meu próximo tratamento?" | pessoal (seção 7) |

## 9. Herança de contexto com limite (regra fechada)

Mensagens curtas ("e domingo?", "e a desobsessão?", "e amanhã?", "e eu?") herdam só do **último turno relevante**:
- **Janela:** último turno ≤ 10 min e presente em `ultimos_turnos`.
- "e <dia/tempo>?" → herda escopo+entidade, troca data.
- "e a <entidade>?" → herda escopo+data, troca entidade.
- "e eu?" → escopo pessoal, herda entidade+data; exige identidade.
- **Parar e esclarecer** quando: sem turno recente; muda 2+ dimensões ambiguamente; escopo herdado conflita com a entidade nova.
- Sem memória longa: só o último contexto válido.

## 10. Privacidade / identidade confiável

- **Confiável:** telefone do remetente casa exatamente (dígitos) com `celular`/`telefone` de um `assistido` não excluído. Único gatilho que libera dados pessoais.
- **Não confiável:** match só por `profiles`; nome parcial citado no texto; nenhum match.
- **Absoluto:** dado pessoal nunca exposto sem identidade confiável → pedir identificação ou handoff.

## 11. Política de confiança

1. Confiança baixa → pedir esclarecimento, não escalar.
2. Identidade não confiável → não expor dado; pedir identificação.
3. Sem base confiável → **ausência honesta em linguagem humana** (seção 14); nunca inventar.
4. Persistindo impossibilidade (sensível/falha/ambiguidade) → handoff.

Precedência: sensível → identidade → confiança → fatos → handoff.

## 12. Memória curta — operação e resumo (custo controlado)

Coluna nova `whatsapp_conversas.contexto_conversa` (JSONB, sem tabelas novas) com `assunto_atual`, `entidade_atual`, `referencia_temporal`, `escopo`, `assistido_identificado`, `assistido_id`, `ultimos_turnos`.

Resumo determinístico (sem LLM, custo zero):
- Máx. **4 turnos** (FIFO); cada um truncado a ~120 chars (mantém o início).
- Guarda só o essencial estruturado, não texto bruto inteiro.
- Histórico enviado ao LLM limitado a esses 4 turnos curtos.

## 13. Payload estruturado para geração final

```json
{ "intencao": "...", "escopo": "publico|pessoal", "entidade": "...",
  "data_resolvida": { "tipo": "dia", "inicio": "2026-06-21", "label": "amanhã" },
  "fatos": [ { "nome": "Evangelhoterapia", "horario": "20:00", "status": "mantido" } ],
  "confianca": "alta|media|baixa", "precisa_handoff": false,
  "precisa_esclarecimento": false, "identificado": true,
  "obs_contexto": "follow-up de 'tem palestra hoje?'" }
```

`fatos` vazio → ausência honesta. O LLM redige **só** a partir do payload.

## 14. Regras concretas de tom (incluindo ausência honesta)

- Informação principal primeiro (1 frase); complemento só se necessário.
- Sem repetir saudação a cada turno; sem frases genéricas/burocracia.
- Fechamento gentil só quando fizer sentido; emoji com moderação; nunca inventar.
- **Ausência honesta:** quando não há ocorrência válida ou confirmação suficiente, responder de forma **clara, acolhedora e humana** — nunca seca, vaga ou ambígua. Ex.: "Não encontrei evangelhoterapia agendada para os próximos dias. Se quiser, posso verificar outra data ou te encaminhar para nossa equipe." em vez de "Não há." ou respostas genéricas.

## 15. Observabilidade e métricas (comparar com baseline da Fase 0)

Campos extras no `notificacoes_log` (`confianca`, `escopo`, `usou_llm`, `custo_estimado`) + consultas: % handoff; % resolvido sem fallback; intents frequentes; perguntas mal compreendidas; taxa de erro pública e pessoal; frequência de esclarecimento; custo médio por mensagem.

## 16. Ordem de implementação (entregáveis por fase)

- **Fase 0 — Baseline:** snapshot das métricas atuais (seção 3). Sem deploy.
- **Fase 1 — Memória + Resolução temporal:** coluna `contexto_conversa`, resumo (seção 12), `resolverTempo` (seção 4), herança com limite (seção 9). Testes. Sem LLM.
- **Fase 2 — Orquestrador + público/pessoal:** precedência fechada (seção 6), próxima ocorrência com validação de exceção (seção 7), desambiguação (seção 8), regra sem-data (seção 5), confiança e privacidade (seções 10–11).
- **Fase 3 — Geração final grounded:** geração via **modelo leve/barato disponível no gateway homologado, preferencialmente da família flash/lite**, redigindo a partir do payload (seção 13) com o tom da seção 14; fallback determinístico (helpers atuais) sempre disponível.
- **Fase 4 — Classificador híbrido (LLM apenas no gap):** o classificador determinístico continua sendo o caminho principal; o LLM é acionado **somente** quando a confiança é baixa ou a intenção é `complexo`/ambígua. **Não** se transforma o classificador inteiro em dependente de modelo — a maioria das mensagens nunca chama LLM na classificação.
- **Fase 5 — Métricas + calibração + handoff:** campos de log + consultas (seção 15) vs baseline; refino de handoff e prompts.

## 17. Riscos e mitigações

- Alucinação → LLM só redige sobre payload; fallback determinístico.
- Custo → curto-circuito determinístico, modelo leve flash/lite, prompts mínimos, resumo sem LLM, LLM só no gap.
- Regressão → helpers atuais como fallback; suíte existente (451 testes).
- "Próxima" inválida → validação de exceção obrigatória (seção 7).
- Vazamento de dado pessoal → identidade confiável obrigatória (seção 10).

## Mudanças de dados
- 1 coluna nova: `whatsapp_conversas.contexto_conversa` (JSONB). Nenhuma tabela nova.
- Campos de auditoria no `notificacoes_log` (confiança, escopo, uso de LLM, custo).
- Lovable AI Gateway com modelo leve flash/lite em 2 pontos cirúrgicos; helpers atuais preservados.
