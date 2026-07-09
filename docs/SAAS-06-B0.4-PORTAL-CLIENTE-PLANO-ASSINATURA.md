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

---

## 12. Notificações comerciais e repetição até atendimento

Esta extensão do recorte SAAS-06-B0.4 adiciona **alertas persistentes** ao
platform_admin sempre que uma solicitação for aberta e permanecer pendente.

### Tipos de solicitação (extensão)

Além dos históricos (`novo_modulo`, `desabilitar_modulo`, `alterar_plano`,
`segunda_via_cobranca`, `cancelamento`, `contato_comercial`, `outro`), o
formulário atual do admin local usa:

- `solicitar_novo_modulo`
- `solicitar_desabilitar_modulo`
- `alterar_plano`
- `segunda_via_cobranca`
- `informar_pagamento`
- `solicitar_cancelamento`
- `falar_com_comercial`
- `suporte_comercial`

### Status

`pendente`, `em_analise`, `aguardando_cliente`, `aguardando_pagamento`,
`aprovada`, `recusada`, `concluida`, `cancelada`.

### Prazos de alerta (horas úteis, pulando sábados e domingos)

Centralizados em `src/constants/solicitacoesComerciais.ts` e espelhados na
função `public.fn_solicitacao_proximo_alerta`:

| Alerta | Momento |
|---|---|
| 1º (imediato) | ao criar |
| 2º | +2h úteis |
| 3º | +24h úteis |
| 4º | +48h úteis |
| 5º em diante | +72h úteis e **prioridade crítica** |

A partir do 3º alerta a prioridade sobe para **alta**; a partir do 4º vira
**crítica**.

### Critérios de parada

O `proximo_alerta_em` é limpo (e o ciclo é interrompido) quando:

- o status muda de `pendente` para qualquer outro valor
  (`em_analise`, `aguardando_cliente`, `aguardando_pagamento`, `aprovada`,
  `recusada`, `concluida`, `cancelada`);
- um `platform_admin` executa a RPC
  `fn_assumir_solicitacao_comercial(_id)` — o responsável é registrado, a
  hora de assunção é gravada e (se estava pendente) o status vira
  `em_analise`.

### Canais

- **Central do platform_admin** (`/portal/admin/solicitacoes`): alertas
  atrasados aparecem em vermelho no campo "Próximo", com contador de
  alertas emitidos, badge de prioridade e resumo (pendentes / atrasadas /
  críticas) no topo da página.
- **Auditoria persistente** em `audit_logs` com o marcador
  `saas06_b04_solicitacao_comercial_alerta` para cada evento:
  `solicitacao_criada`, `alerta_enviado`, `atendimento_assumido`,
  `status_alterado`. É a fonte de verdade histórica dos disparos.
- E-mail e WhatsApp ficam como extensão futura (o dispatcher institucional
  existente pode ser ligado sem alterar o modelo de dados).

### Idempotência

Cada disparo usa `dedupe_key = <solicitacao_id>:<quantidade_alertas>`. A
função `fn_processar_alertas_comerciais`:

- Bloqueia com `FOR UPDATE SKIP LOCKED`.
- Verifica se já existe um `audit_logs` com o mesmo `dedupe_key`; se sim,
  apenas reagenda o próximo alerta sem duplicar.
- Só então incrementa o contador, atualiza `ultimo_alerta_em`,
  `proximo_alerta_em`, `prioridade` e grava o audit log.

### Cron

Agendado via `pg_cron` como `saas06_b04_alertas_comerciais`, executa
`SELECT public.fn_processar_alertas_comerciais();` a cada 15 minutos (sem
HTTP externo — chamada direta no banco).

### Responsabilidades do platform_admin

- Visualizar solicitações pendentes, em análise, atrasadas e críticas.
- **Assumir atendimento** (RPC): registra responsável, para a repetição e
  move o status para `em_analise` se estava pendente.
- Alterar `status` e `observacao_interna`.
- Nunca há habilitação, cobrança, aprovação ou cancelamento
  **automáticos**: a habilitação real segue em Central de Assinaturas.

### Visão do admin local

- Abre a solicitação pelo botão "Nova solicitação".
- Acompanha `status` e `concluida_em` na tabela.
- Não altera `status`, `observacao_interna`, plano, assinatura nem
  módulos — tudo bloqueado por RLS (`UPDATE` restrito a platform_admin).

### Auditoria

Toda mudança relevante gera linha em `public.audit_logs` com
`acao = 'saas06_b04_solicitacao_comercial_alerta:<evento>'`:

- `solicitacao_criada`
- `alerta_enviado`
- `atendimento_assumido`
- `status_alterado`

### Ausência de automação de venda (reafirmado)

Nada nesta extensão automatiza venda, cobrança, ativação de módulo,
aprovação de solicitação, cancelamento de assinatura ou integração com
gateway de pagamento. Todo movimento comercial continua sendo executado
manualmente pelo platform_admin.

### Testes executados

Suíte `src/test/governanca/saas06b04-notificacoes-comerciais.test.ts`
cobre:

- ampliação de tipos e status;
- colunas de notificação/atendimento presentes;
- intervalos 2h/24h/48h/72h úteis e prioridade crítica no 4º alerta;
- trigger de criação agenda alerta imediato e audita;
- trigger de update limpa `proximo_alerta_em` ao sair de `pendente`;
- `fn_processar_alertas_comerciais` idempotente com dedupe_key e
  `FOR UPDATE SKIP LOCKED`;
- RPC `fn_assumir_solicitacao_comercial` `SECURITY DEFINER`, restrita a
  `platform_admin` e revogada de `anon`, interrompendo a repetição;
- UI do platform_admin exibe prioridade, próximo alerta, contador,
  responsável e botão Assumir;
- UI do admin local usa apenas `INSERT` em `solicitacoes_comerciais` e
  **não** altera plano/assinaturas/módulos;
- documento cobre a seção "Notificações comerciais e repetição até
  atendimento".
