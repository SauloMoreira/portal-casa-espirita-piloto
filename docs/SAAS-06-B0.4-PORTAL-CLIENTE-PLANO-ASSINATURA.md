# SAAS-06-B0.4 — Portal do Cliente: Plano, Assinatura, Módulos e Solicitações

- **Status:** Entregue
- **Data:** 2026-07-09
- **Predecessores:** SAAS-06-B0 (Central de Assinaturas), SAAS-06-B0.3 (Módulos por instituição), SAAS-06-B0.6 (Vínculo admin_instituicao), SAAS-06-B0.7 (Sync papel admin_instituicao → role global).

---

## 1. Objetivo

Dar ao **administrador local da instituição** uma superfície própria dentro do
Portal para consultar o **plano comercial**, o **status da assinatura**, os
**módulos habilitados**, **vencimentos**, **último pagamento**, **documentos
comerciais** e **abrir solicitações comerciais** (novo módulo, cancelamento,
segunda via, contato comercial etc.), **sem** permissão para alterar
diretamente plano, status ou módulos.

## 2. Visão do admin local (`/portal/plano-assinatura`)

Acessível a:

- Usuários com **vínculo ativo** em `instituicao_usuarios` cujo `papel_local`
  seja `admin_instituicao`.
- `platform_admin` / `platform_owner` (superset).

**Bloqueados**: assistidos, voluntários comuns, tarefeiros, entrevistadores
sem papel admin, usuários sem vínculo, vínculos inativos. A guarda é aplicada
na UI (`podeAcessar`) e reforçada pelo RLS no backend.

### Dados exibidos

- Instituição (nome).
- Plano atual (nome e descrição).
- Status da assinatura (trial, ativa, suspensa, cancelada, inadimplente,
  encerrada).
- Classificação comercial: **demo**, **piloto**, **produção assistida**,
  **cliente** (`assinaturas.classificacao`).
- Valor mensal (`valor_mensal_cents`, formatado em BRL).
- Forma de cobrança (`forma_pagamento`, texto livre).
- Próximo vencimento (`proximo_vencimento`).
- Último pagamento (`ultimo_pagamento_em`).
- Trial até (`trial_ate`).
- Início da assinatura.
- Observações comerciais **visíveis ao cliente** (`observacoes_cliente`).
- Documentos comerciais (kit SAAS-06-A: proposta, termo, LGPD, política de suporte).

Observação: `observacoes_comerciais` continua sendo o campo **interno**, visível
apenas ao `platform_admin` na Central de Assinaturas.

### Módulos comerciais

O portal do cliente exibe apenas os **módulos comerciais oficiais**:

| Módulo | Estado |
|---|---|
| **Tratamentos** | Único módulo em produção. Agenda, entrevistas, presença, relatórios, comunicação e IA de apoio são **funcionalidades internas** desse módulo — nunca aparecem como módulos comerciais separados. |
| **Caixa / Cantina** | Em breve |
| **Biblioteca** | Em breve |
| **Portal Institucional** | Em breve |
| **Financeiro** | Em breve |

Cada módulo mostra badge `Habilitado`, `Disponível` ou `Em breve` conforme
composição plano × override × catálogo (`assinatura_modulos` prevalece sobre
`plano_modulos`).

### Solicitações comerciais

O admin local abre solicitações via diálogo "Nova solicitação". Tipos:

- Solicitar novo módulo
- Solicitar desabilitação de módulo
- Solicitar alteração de plano
- Solicitar segunda via de cobrança
- Solicitar cancelamento
- Solicitar contato comercial
- Outro

Cada solicitação persiste em `public.solicitacoes_comerciais` com:
`instituicao_id`, `solicitante_user_id`, `tipo`, `modulo_codigo?`, `mensagem`,
`status` (default `pendente`), `observacao_interna?`, `concluida_em?`,
`created_at`, `updated_at`.

## 3. Visão do platform_admin (`/portal/admin/solicitacoes`)

Acessível apenas a `platform_admin`. Permite:

- Listar todas as solicitações da plataforma, com filtro por instituição e status.
- Alterar `status` (pendente, em_analise, aguardando_pagamento, aprovada,
  recusada, concluida, cancelada).
- Registrar **observação interna** (invisível ao cliente).
- Ao mover para status terminal (`aprovada`, `recusada`, `concluida`,
  `cancelada`), o trigger `fn_solicitacoes_comerciais_touch` preenche
  `concluida_em` automaticamente.

**Aprovar não habilita módulo automaticamente.** A habilitação real continua
sendo feita em **Central de Assinaturas → Editar → Módulos habilitados**
(fluxo SAAS-06-B0.3).

## 4. Backend

### Tabela `public.solicitacoes_comerciais`

Colunas específicas do domínio: `instituicao_id`, `solicitante_user_id`,
`tipo`, `modulo_codigo`, `mensagem`, `status`, `observacao_interna`,
`concluida_em`.

Índices: `(instituicao_id, created_at DESC)` e `(status, created_at DESC)`.

### Helpers `SECURITY DEFINER`

- `fn_is_admin_instituicao(_user_id, _inst_id)` — true quando o usuário tem
  vínculo ATIVO com `papel_local = 'admin_instituicao'` na instituição.
- `fn_is_platform_admin(_user_id)` — true quando o usuário está em
  `platform_admins`.

Ambas são `REVOKE`d do `anon` e apenas `authenticated` / `service_role`
executam. Uso restrito às policies e edge functions.

### RLS

- **SELECT**: platform_admin **ou** admin local da instituição.
- **INSERT**: `solicitante_user_id = auth.uid()` **e** (platform_admin **ou**
  admin local da instituição).
- **UPDATE**: **apenas platform_admin** — o admin local não altera solicitação
  após enviar.

### Campos comerciais complementares em `assinaturas`

- `classificacao text` (`demo`, `piloto`, `producao_assistida`, `cliente`).
- `observacoes_cliente text` (visíveis ao admin local).

## 5. Regras de acesso (defense-in-depth)

- Admin local vê apenas a **própria instituição** (ativa no
  `InstituicaoContext`). RLS impede leitura cruzada mesmo se o front burlar
  a seleção.
- Admin local **não altera** plano, status da assinatura ou módulos
  diretamente — apenas cria solicitações.
- `platform_admin` vê todas as instituições e solicitações; é a única persona
  autorizada a alterar status/observação interna e a executar a habilitação
  real do módulo.
- Assistidos, voluntários comuns, tarefeiros, entrevistadores sem vínculo
  admin e vínculos inativos são bloqueados pela guarda `podeAcessar` e por
  RLS.

## 6. Cobrança e pagamentos

Sem gateway integrado nesta fase:

- **Não** integra Stripe, Mercado Pago ou emissores de boleto.
- **Não** gera cobrança automática.
- O portal exibe explicitamente **"Cobrança manual nesta fase."**.

Campos meramente informativos: `valor_mensal_cents`, `forma_pagamento`,
`proximo_vencimento`, `ultimo_pagamento_em`. A operação de cobrança segue
manual (PIX / boleto / link de pagamento) coordenada pelo Portal.

## 7. Documentos comerciais

Enquanto não há upload/armazenamento formal, o portal exibe referências fixas
ao kit **SAAS-06-A**:

- `docs/saas-06-a/01-proposta-comercial.md`
- `docs/saas-06-a/02-termo-adesao-saas.md`
- `docs/saas-06-a/03-anexo-lgpd.md`
- `docs/saas-06-a/04-politica-suporte.md`

**Pendência futura**: upload de PDF assinado por instituição em bucket
privado (`documentos_comerciais/<inst_id>/...`) com policy que replique o
mesmo modelo `admin local + platform_admin`.

## 8. Rotas e navegação

- `/portal/plano-assinatura` — página do admin local.
- `/portal/admin/solicitacoes` — visão do platform_admin.
- Sidebar > **Institucional** → "Plano e Assinatura" (papel `admin`; via
  trigger SAAS-06-B0.7, `admin_instituicao` recebe role global `admin`
  automaticamente).
- Portal (`/portal`) exibe atalho quando há instituição selecionada e o
  usuário é admin local ou platform_admin.
- PortalAdmin (`/portal/admin`) recebeu botão para "Solicitações comerciais".

## 9. Testes executados

- `src/test/governanca/saas06b04-portal-cliente-plano-assinatura.test.ts`
  cobre:
  - existência da tabela e enums (tipos e status);
  - RLS habilitado e GRANT para `authenticated`;
  - policies SELECT (admin local + platform_admin) e UPDATE (só platform_admin);
  - colunas comerciais complementares em `assinaturas`;
  - página do admin local exibe os 5 módulos comerciais oficiais;
  - página do admin local NÃO executa `update`/`upsert` em `assinaturas`
    ou `assinatura_modulos` — só `insert` em `solicitacoes_comerciais`;
  - guardas de acesso (`podeAcessar`, `Navigate to ROUTES.portal`);
  - página do platform_admin tem filtros, permite alterar `status` e
    `observacao_interna`, e declara que aprovar não habilita módulo;
  - rotas registradas em `App.tsx` e `routes.ts`, com `PlatformAdminRoute`
    protegendo `/portal/admin/solicitacoes`;
  - documento cobre todas as seções obrigatórias.

## 10. Fora de escopo (fica para recortes futuros)

- Integração com gateway de pagamento (Stripe / Paddle / Mercado Pago).
- Aprovação automática de solicitação habilitando módulo sem ação manual.
- Migração de dados reais entre projetos.
- Alterações no projeto **Tratamentos FER** original.
- Portal público self-service de contratação.
- Upload/armazenamento formal de documentos comerciais por instituição
  (planejado, não incluído).

## 11. Indicadores

- **0028:** +0 (helpers `fn_is_admin_instituicao` e `fn_is_platform_admin`
  ficam disponíveis a `authenticated` — necessário para as policies).
- **0029:** +2 (mesma justificativa; escopo explícito por `_user_id` no
  primeiro caso e por `platform_admins` no segundo).
- **0025:** +0.
