# 08 — Plano de Cobrança Manual Inicial

Durante o piloto assistido, a cobrança é **100% manual**, sem gateway de
pagamento recorrente. Objetivo: simplicidade, controle e reversibilidade.

---

## 1. Meios de pagamento aceitos

- **PIX** (chave institucional do Portal — a preencher).
- **Boleto bancário** (emitido pelo Portal quando solicitado).
- **Link de pagamento** avulso (cartão de crédito, quando necessário).

## 2. Ciclo de cobrança

| Item | Momento | Valor | Observação |
|------|---------|-------|------------|
| Setup (opcional) | Antes do provisionamento | R$ [valor ou isento] | Único |
| Mensalidade piloto | Todo dia [x] do mês | R$ [valor] | Cobrança promocional durante o piloto |
| Serviços sob demanda | Após aprovação de escopo | R$ [valor] | Ex.: importação de base legada |

## 3. Fluxo operacional

1. **D-5** do vencimento: Portal envia lembrete por e-mail e WhatsApp, com
   valor, chave PIX, boleto e/ou link.
2. **D0**: vencimento.
3. **D+3**: 1º lembrete de atraso, cordial.
4. **D+7**: 2º lembrete, com comunicação ao ponto focal administrativo.
5. **D+15**: notificação formal e possibilidade de **suspensão** do acesso
   funcional (leitura mantida). Nunca há exclusão automática de dados.
6. **D+30**: se não regularizado, o piloto pode ser **encerrado** conforme a
   cláusula de encerramento do Termo, com exportação dos dados entregue à Casa.

## 4. Emissão fiscal

- Nota fiscal emitida pela Contratada, quando aplicável ao seu regime, até 5
  dias úteis após confirmação do pagamento.

## 5. Reajustes e mudanças

- Nenhum reajuste durante os 60-90 dias do piloto.
- Ao migrar para o plano regular pós-piloto, os valores praticados são
  revisados por proposta específica.

## 6. Registro interno (uso do Portal)

O Portal mantém uma planilha ou tabela simples com:

- Casa, CNPJ, ponto focal financeiro.
- Data de vencimento e status (pago, em aberto, atrasado, suspenso).
- Comprovantes recebidos.
- Nota fiscal emitida.

Automação de cobrança recorrente e checkout self-service ficam para recortes
posteriores (fora do escopo do SAAS-06-A).
