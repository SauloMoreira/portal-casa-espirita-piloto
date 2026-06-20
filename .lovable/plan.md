# Base de conhecimento do site FER como apoio à IA

Site: **www.fermarica.com.br** · Captura **assistida por página** · Busca **textual por categoria/prioridade** · **Fase 1 enxuta**.

## Princípio
O site é uma **camada de apoio para perguntas públicas de conhecimento** (ex.: "o que é magnetismo?", "como funciona a FER?", "quais tratamentos a casa realiza?"). Ele **nunca** sobrepõe orquestrador, agenda real, agendamento pessoal, exceções operacionais nem programação padrão. Perguntas temporais/operacionais/pessoais (hoje tem palestra? amanhã tem tratamento? meu próximo atendimento? minha entrevista?) continuam resolvidas pela arquitetura atual. Doação/campanha/evento/notícias **não** contaminam respostas sobre tratamento.

## 1. Modelo de dados — `public.ia_site_documentos`
Tabela dedicada (separada da `ia_biblioteca` doutrinária):
- `url` (único), `titulo`, `resumo`, `corpo` (texto limpo)
- `categoria`: `tratamento | institucional | contato | doacao | campanha | evento | comunicado | outros`
- `prioridade`: `alta | media | baixa | condicionada`
- `temporal` (bool), `data_conteudo` (date, opcional)
- `usar_na_ia` (bool, **default false**), `status`: `rascunho | ativo | inativo`
- `hash`, `captured_at`, `created_by`, timestamps

**Regra de entrada:** toda captura nasce `status='rascunho'` e `usar_na_ia=false`; só entra na IA após revisão humana e ativação explícita do admin.

Segurança: admin gerencia tudo; leitura pela edge inbound via `service_role`. Migração com GRANT explícito + RLS + policies + trigger `updated_at`.

Prioridade sugerida (editável na revisão): tratamento/institucional/contato = **alta**; doacao/campanha/evento = **media**; comunicado = **baixa/condicionada**.

## 2. Captura assistida por página — edge `ia-site-ingestao`
Admin-only (valida sessão + papel), validação Zod do `url`, CORS:
- **Restrição de domínio:** nesta fase só aceita URLs de `www.fermarica.com.br` (rejeita sites externos).
- Busca o HTML, remove `script/style/nav/header/footer/aside`, extrai texto principal, normaliza espaços.
- Deriva `titulo` (`<title>`/`<h1>`), `resumo` curto, `categoria`/`prioridade`/`temporal` sugeridos (heurística de palavras-chave) e `hash`.
- **Retorna a prévia extraída sem salvar.** O admin revisa/ajusta e então grava (rascunho).
- (Firecrawl é evolução futura; não necessário na Fase 1.)

## 3. Atualização e controle de mudanças
- Recaptura de URL existente: comparar por `hash`. Hash igual → não duplica. Hash diferente → atualização controlada do rascunho / revisão explícita. **Nunca** sobrescrever silenciosamente um documento `ativo` sem revisão humana.
- Data: se `data_conteudo` não puder ser inferida com segurança, deixar **NULL** (nunca inventar data).

## 4. Recuperação controlada — `src/lib/siteConhecimento.ts`
Módulo puro (sem I/O), espelhado na edge (padrão do projeto). `selecionarDocumentos(query, intencao, docs)`:
- Filtra por categoria-alvo; busca textual em `titulo/resumo/corpo` com normalização consistente (lowercase, sem acento, espaços, tolerância leve).
- Considera apenas `status='ativo'` e `usar_na_ia=true`.
- Relevância **determinística e simples**: match em `titulo` > `resumo` > `corpo`, depois prioridade. Sem ranking sofisticado nesta fase. Limita contexto (default 3).
- **Anti-contaminação:** pergunta de tratamento nunca retorna `doacao`/`campanha`.
- **Guarda temporal:** docs `temporal=true` não entram por padrão, nunca viram fonte de agenda; só quando a pergunta for claramente sobre aquele conteúdo e a data fizer sentido.

## 5. Mapeamento intenção → categorias
- Explicação de tratamento/terapia → `tratamento`
- Funcionamento da casa → `institucional` + `contato`
- Contato/localização/canais → `contato`
- Doação → `doacao`; campanha → `campanha`; evento → `evento`

Só consultar a base quando houver indício de **pergunta pública de conhecimento**.

## 6. Integração com a IA atual (whatsapp-inbound, aditiva)
1. Resolver escopo/orquestrador como hoje (sem mudar precedência).
2. Pergunta temporal/operacional/pessoal → **não consulta o site**.
3. Pergunta pública de conhecimento (`pedido_informacao`, `programacao_publica` conceitual, e `complexo` **somente** com indício claro de conhecimento público) → consulta `ia_site_documentos` (`ativo` + `usar_na_ia`), roda `selecionarDocumentos`.
4. Com docs relevantes → resposta **grounded** nos fatos do site via `humanizarRespostaIA` (sem inventar).
5. Sem docs relevantes → comportamento atual inalterado (ponte/handoff).

Regra: não usar a base para qualquer `complexo` — apenas quando claramente for pergunta pública de conhecimento.

## 7. Painel admin — aba "Base do Site"
`src/components/central-ia/BaseSiteIA.tsx` (admin-only):
- Listar docs com URL, categoria, prioridade, status, temporal, `usar_na_ia`.
- "Adicionar por URL" → chama `ia-site-ingestao`, mostra prévia, salva como rascunho.
- Editar, ativar/inativar, excluir, toggle `usar_na_ia`.
- Filtros: categoria, status, `usar_na_ia`, URL/título.

## 8. Regras Operacionais (calibração sem deploy)
Adicionar em `regras_operacionais`:
- `site_ia_ativo` — liga/desliga toda a consulta ao site.
- `site_ia_max_documentos` — limite de contexto (default 3).

## 9. Fases
- **Fase 1 (esta entrega):** Tratamentos + institucional permanente + contato.
- **Fase 2:** doação, campanhas, eventos (peso menor, só quando perguntado).
- **Fase 3:** posts/notícias e temporais (peso baixo, guarda temporal forte).

## 10. Testes
- **Conhecimento:** magnetismo, desobsessão, evangelhoterapia, apometria, "quais tratamentos a casa realiza".
- **Não-contaminação:** tratamento nunca traz doação/campanha.
- **Temporais:** conteúdo temporal não vira agenda, não sobrepõe exceção/programação real.
- **Integração:** captura entra como rascunho; não entra na IA sem ativação; respeita `usar_na_ia`; domínio permitido respeitado.
- **Regressão:** orquestrador, classificador, handoff, fila humana, métricas, claim intactos.

## 11. Critérios de aceite
IA usa o site como base complementar; tratamentos claramente influenciados; doação/campanha não contaminam tratamento; temporais não sobrepõem agenda/exceção; capturas entram como rascunho e só ativam após revisão; captura restrita ao domínio institucional; integração sem quebrar a arquitetura; testes de conhecimento e regressão cobrindo o comportamento.

## 12. Detalhes técnicos
- Migração da tabela (CREATE TABLE + GRANT + RLS + policies + trigger).
- Edge `ia-site-ingestao` (role, Zod, restrição de domínio, CORS).
- `src/lib/siteConhecimento.ts` + testes; `types.ts` regenerado.
- Alteração **aditiva** no `whatsapp-inbound` (espelha lógica pura), sem mexer na precedência.
- Nova aba/componente na Central de IA; 2 chaves novas em Regras Operacionais.
