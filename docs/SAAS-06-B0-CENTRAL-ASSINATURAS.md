# SAAS-06-B0 — Central de Assinaturas e Controle Comercial Manual

## Objetivo

Permitir que o `platform_admin` gerencie manualmente, em uma tela dedicada do
Portal Admin, o ciclo de vida comercial das assinaturas das instituições em
produção assistida — plano, status, vencimento, módulos liberados e
observações comerciais — **sem** qualquer integração com gateway de pagamento
e **sem** migrar dados reais.

Fase preparatória para a simulação de venda da **FER Piloto** e das primeiras
casas clientes.

## Estado atual (base)

- Fundação SaaS (SAAS-02) já provê `instituicoes`, `planos`, `plano_modulos`,
  `modulos`, `assinaturas`, `platform_admins`, `instituicao_usuarios`.
- Portal Admin (SAAS-03) já existe em `/portal/admin` com visão de instituições.
- Hook `usePortalHub` já bloqueia acesso a módulos quando a assinatura está
  `cancelada` ou `suspensa`.

## Escopo entregue

### 1. Menu no Portal Admin

- Botão **Central de Assinaturas** no cabeçalho de `PortalAdmin`, apontando
  para a nova rota `/portal/admin/assinaturas`.
- Rota registrada em `ROUTES.portalAssinaturas` e no `App.tsx`.
- Botão **+ Nova instituição/assinatura** no cabeçalho da Central, disponível
  apenas para `platform_admin` (guard duplo cliente + RLS).

### 1.1 Criação manual de instituição + assinatura

O botão **Nova instituição/assinatura** abre um formulário único que:

- cria uma linha em `instituicoes` (nome, nome_fantasia, slug, cidade/UF,
  e-mail/telefone de contato, classificação comercial, `status='implantacao'`);
- cria imediatamente a assinatura vinculada em `assinaturas`
  (plano, status, data de início, trial até, próximo vencimento, valor mensal
  em centavos, forma de cobrança, observações comerciais);
- registra `Responsável` e `E-mail do administrador inicial` como observações
  comerciais — o convite ao usuário admin continua no fluxo padrão
  (`/solicitar-cadastro` + vínculo em `instituicao_usuarios`), fora do escopo
  desta tela;
- **nunca** cria assinatura solta: a inserção de `assinaturas` só ocorre
  depois de o `INSERT` em `instituicoes` retornar sucesso, com o mesmo
  `instituicao_id`;
- exige `nome`, `slug` e `plano` — demais campos são opcionais.

Módulos liberados continuam derivados do plano (`plano_modulos`); a Central
não edita a composição de plano.

### 2. Nova página `PortalAssinaturas`

Para cada instituição, permite visualizar e editar:

- classificação comercial (**demo**, **piloto**, **produção assistida**,
  **cliente ativo**);
- plano atual (dropdown de `planos`);
- status da assinatura (ver §3);
- data de início, data de término, trial até;
- próximo vencimento e último pagamento;
- valor mensal (em centavos, para evitar arredondamento);
- forma de cobrança: `pix`, `boleto`, `link_manual`, `transferencia`, `outro`;
- observações comerciais e condição especial (texto livre).

Módulos habilitados são calculados a partir do plano (`plano_modulos`) e podem
ser **sobrepostos por instituição** pelo `platform_admin` — ver §8. A
composição interna de plano (o que cada plano oferece por padrão) permanece
fora do escopo do B0 (fica na tela **Planos**, quando existir).

### 3. Status da assinatura

Enum `saas_assinatura_status` estendido para:

- `trial` — libera módulos;
- `ativa` — libera módulos;
- `inadimplente` — libera módulos, mas exibe alerta administrativo;
- `suspensa` — **bloqueia** módulos operacionais;
- `cancelada` — **bloqueia** módulos operacionais;
- `encerrada` — **bloqueia** módulos operacionais (novo).

`usePortalHub.acessivel` atualizado para bloquear as três situações acima.

### 4. Regras de acesso

- `platform_admin` acessa `/portal/admin/assinaturas` (guard duplo:
  redirect no cliente + RLS `assinaturas_platform_write` no backend).
- Admin local **não** altera assinatura — a RLS já impede: escrita em
  `public.assinaturas` exige `is_platform_admin(auth.uid())`.
- Assinaturas `trial` e `ativa` liberam módulos.
- `suspensa`, `cancelada`, `encerrada` bloqueiam módulos operacionais.
- `inadimplente` mantém acesso, mas a UI pode destacar como alerta.

### 5. Controle de cobrança manual

Todos os campos financeiros são **anotações manuais** — não há job de cobrança,
não há webhook, não há dispatcher automático. Uma trigger de validação garante
que:

- `valor_mensal_cents >= 0`;
- `forma_pagamento` pertence à lista fechada
  (`pix`, `boleto`, `link_manual`, `transferencia`, `outro`).

### 6. Histórico

O histórico detalhado (auditoria de alteração de plano, status, vencimento e
módulos) permanece **pendência conhecida** — o SaaS ainda não tem trilha
`audit_logs` conectada a `assinaturas`. Marcado no backlog para uma fase
posterior (integrar com `audit_logs` existente ou criar `assinatura_historico`).

### 7. Produção assistida

`instituicoes.classificacao_comercial` (enum `saas_classificacao_comercial`)
com os valores:

- `demo` (padrão);
- `piloto`;
- `producao_assistida`;
- `cliente_ativo`.

Editável pelo próprio dialog da Central de Assinaturas.

## Fora do escopo

- Nenhuma integração com gateway (Stripe, Paddle, Mercado Pago, etc.).
- Nenhuma cobrança recorrente automatizada.
- Nenhuma migração de dados reais.
- Nenhum ajuste no projeto **Tratamentos FER** original.
- Nenhuma criação de tenant FER real ainda.
- Nenhuma alteração em RLS/policies/RPCs/edges além do mínimo necessário
  (GRANT `UPDATE`/`INSERT` em `assinaturas` para `authenticated`; a policy
  `assinaturas_platform_write` continua sendo a única fonte de autorização
  de escrita).

## Migração

`supabase/migrations/*_saas06b0_central_assinaturas.sql`:

- adiciona `encerrada` ao enum `saas_assinatura_status` (idempotente);
- cria enum `saas_classificacao_comercial`;
- adiciona `instituicoes.classificacao_comercial` (default `demo`);
- adiciona colunas comerciais opcionais em `assinaturas`;
- adiciona trigger `tg_assinaturas_valida_comercial` (validação leve);
- concede `UPDATE`/`INSERT` para `authenticated` (RLS mantém a autorização real).

Idempotente: pode rodar em ambientes que já receberam parte das colunas.

## Testes

Cobertura em `src/test/governanca/saas06b0-central-assinaturas.test.ts`:

- página `PortalAssinaturas` existe e é lazy-carregada;
- rota `/portal/admin/assinaturas` registrada em `ROUTES` e `App.tsx`;
- guard duplo: `usePortalHub().isPlatformAdmin` + fallback `<Navigate>`;
- `usePortalHub` bloqueia `suspensa`, `cancelada` e `encerrada`;
- enum estendido com `encerrada`;
- migração cria enum de classificação e trigger de validação;
- cobrança automática (Stripe/Paddle/MP) explicitamente **não** integrada;
- projeto Tratamentos FER original permanece intocado (nenhuma referência a
  `tratamentos-fer` foi criada nesta entrega).

## Indicadores (delta atribuível ao SAAS-06-B0)

- 0028: 0 (nenhum novo `SECURITY DEFINER` público criado);
- 0025: 0;
- 0029: 0 (nenhum novo `SECURITY DEFINER` autenticado criado).

## Critério de aceite

Considerado concluído com:

1. Menu Central de Assinaturas visível no Portal Admin (apenas para
   `platform_admin`);
2. Tela permite visualizar e editar todos os campos comerciais listados;
3. Status controlados: `trial`, `ativa`, `inadimplente`, `suspensa`,
   `cancelada`, `encerrada`;
4. Regras de bloqueio/liberação de módulos refletem status;
5. Nenhuma integração de gateway ativa;
6. Documento presente (este arquivo);
7. Suíte `saas06b0` verde.
