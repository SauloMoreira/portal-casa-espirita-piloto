# SAAS-06-A — Kit de Produção Assistida e Onboarding Comercial

- **Status:** Entregue
- **Data:** 2026-07-08
- **Escopo:** Documental / comercial. Nenhuma alteração de código, schema, RLS, RPC, edge function ou dado real.
- **Predecessores:** SAAS-05-F3 (cutover multi-tenant), SAAS-05-G (validação E2E), SAAS-05-H (RPCs legadas), SAAS-05-I (telemetria).

---

## 1. Objetivo

Preparar o pacote inicial para oferta do **Portal Casa Espírita** em **produção
assistida** para 2 a 3 casas piloto, sem migrar dados reais da FER e sem alterar
o projeto **Tratamentos FER** original.

## 2. Premissas

- Oferta controlada: até **3 casas** simultâneas.
- Prazo do piloto: **60 a 90 dias**.
- Cobrança **manual** (PIX / boleto / link de pagamento).
- Implantação **assistida** pela equipe do Portal.
- **Sem** venda self-service nesta fase.
- **Sem** migração automática de dados reais.
- O sistema Tratamentos FER original **não é desativado nem alterado**.
- Cada casa piloto opera em **tenant próprio**, isolado pelas garantias
  multi-tenant já certificadas (SAAS-05-F3/G/H/I).

## 3. Entregáveis (índice)

Todos os artefatos vivem em `docs/saas-06-a/`:

| # | Documento | Arquivo |
|---|-----------|---------|
| 1 | Proposta Comercial — Produção Assistida | `01-proposta-comercial.md` |
| 2 | Termo de Adesão SaaS | `02-termo-adesao-saas.md` |
| 3 | Anexo LGPD / Tratamento de Dados | `03-anexo-lgpd.md` |
| 4 | Política de Suporte | `04-politica-suporte.md` |
| 5 | Checklist de Onboarding | `05-checklist-onboarding.md` |
| 6 | Roteiro de Treinamento Inicial | `06-roteiro-treinamento.md` |
| 7 | Mensagem de Convite para Casas Piloto | `07-mensagem-convite.md` |
| 8 | Plano de Cobrança Manual Inicial | `08-plano-cobranca.md` |
| 9 | Matriz de Escopo (incluso / fora) | `09-matriz-escopo.md` |
| 10 | Critérios de Aceite da Produção Assistida | `10-criterios-aceite.md` |

## 4. Critérios de aceite do recorte SAAS-06-A

- Todos os 10 documentos existem em `docs/saas-06-a/` e são autossuficientes.
- Nenhuma alteração de código-fonte, schema, RLS, policies, RPCs, edge functions,
  frontend ou configurações do projeto FER original.
- Todos os documentos citam explicitamente a natureza **assistida** do piloto e a
  **ausência de migração automática** de dados reais.
- Testes de governança verdes confirmando presença dos artefatos.

## 5. Fora de escopo (fica para recortes posteriores)

- Página pública de vendas / landing SaaS.
- Checkout self-service e cobrança recorrente automática (Stripe/Paddle).
- Migração automatizada de dados históricos da FER.
- Multi-idioma e personalização white-label profunda.
- SLA contratual formal com penalidades (fica na Política de Suporte como best-effort assistido).

## 6. Indicadores

- **0028:** +0
- **0025:** +0
- **0029:** +0

Recorte puramente documental; nenhum finding de segurança é introduzido.
