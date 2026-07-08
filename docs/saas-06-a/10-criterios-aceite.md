# 10 — Critérios de Aceite da Produção Assistida

O piloto assistido é considerado bem-sucedido quando **todos** os critérios
abaixo forem atendidos até o encerramento (60 a 90 dias).

---

## 1. Provisionamento e isolamento

- [ ] Tenant provisionado e acessível pela Casa em até 3 dias úteis após a
      assinatura do Termo.
- [ ] Isolamento multi-tenant validado: nenhum dado da Casa aparece em outra
      instância e vice-versa (garantia estrutural do SAAS-05-F3/G).
- [ ] Backups gerenciados ativos e ponto de restauração recente disponível.

## 2. Operação real

- [ ] A Casa registra, no piloto, ao menos:
  - 30 assistidos ativos,
  - 4 semanas de agenda operando com presenças reais,
  - 10 entrevistas realizadas,
  - 5 tratamentos concluídos ou em andamento.
- [ ] Nenhum incidente P1 (sistema fora do ar) sem resolução dentro da meta
      de melhores esforços.

## 3. Segurança e privacidade

- [ ] Administrador principal com **MFA** ativada.
- [ ] Nenhum acesso público ou anônimo criado indevidamente.
- [ ] Consentimento WhatsApp funcional (opt-in/opt-out auditados), quando a
      Casa habilitar o canal.
- [ ] Nenhum vazamento entre tenants observado nos relatórios de auditoria.

## 4. Treinamento e adoção

- [ ] 3 encontros de treinamento realizados e gravados.
- [ ] Ponto focal administrativo e ponto focal operacional executando as
      tarefas-chave de seus perfis sem depender do suporte.
- [ ] Central de Ajuda utilizada pela Casa como primeira fonte de dúvidas.

## 5. Suporte

- [ ] Alvos de primeira resposta cumpridos em ao menos 90% dos chamados.
- [ ] Reuniões quinzenais realizadas conforme calendário combinado.
- [ ] Backlog de melhorias registrado, priorizado e comunicado.

## 6. Comercial

- [ ] Pagamentos em dia conforme `08-plano-cobranca.md`, ou renegociados
      formalmente.
- [ ] Nenhuma pendência contratual em aberto.

## 7. Integridade do produto

- [ ] Projeto Tratamentos FER original **não foi alterado**.
- [ ] Nenhum dado real da FER migrado.
- [ ] Nenhuma alteração de RLS, policies, RPCs, edge functions ou schema
      motivada exclusivamente por customização de uma única casa piloto sem
      passar pelo processo de governança do SaaS.

## 8. Decisão final

Ao final do piloto, uma das três decisões formais é registrada:

1. **Continuidade em produção regular** — assinatura do contrato regular e
   ajuste de valores.
2. **Prorrogação do piloto** — por até mais um ciclo, com escopo revisado.
3. **Encerramento** — exportação CSV entregue e eliminação dos dados em até
   30 dias corridos.

## 9. Indicadores para a próxima rodada

- Número de bugs P1/P2 por casa.
- Tempo médio de resposta e resolução.
- NPS simples com os pontos focais.
- Volume real de uso (assistidos, sessões, entrevistas, mensagens).

Estes indicadores alimentam o refino da oferta antes da abertura da próxima
rodada de casas.
