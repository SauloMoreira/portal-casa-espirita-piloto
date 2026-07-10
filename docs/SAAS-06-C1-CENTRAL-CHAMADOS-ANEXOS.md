# SAAS-06-C1 — Central de Chamados com Anexos (FIX10 — preparação)

Status: **preparação / design aprovado**. Implementação será feita em recorte
próprio (FIX10) — este documento define escopo, modelo de dados, RLS, storage,
fluxos e testes que a implementação deve cobrir. Nenhum código de produção da
Central de Chamados é entregue no FIX09.

## 1. Objetivos

- Registrar chamados técnicos, comerciais, de cobrança e de documentos entre
  as casas clientes (admin_instituicao / usuários operacionais / assistidos) e
  o administrador geral da plataforma (platform_admin / platform_owner).
- Permitir envio e recebimento de anexos (prints, PDFs, contratos assinados,
  comprovantes) com isolamento estrito por instituição.
- Servir de destino do botão “Abrir chamado técnico” exibido pelo tratamento
  amigável de erros (implementado no FIX09 como stub que copia o conteúdo).

## 2. Modelo de dados (proposto)

Todas as tabelas em `public`, com `GRANT` explícito, `ENABLE ROW LEVEL
SECURITY` e trigger `updated_at`.

### `chamados_suporte`
- `instituicao_id uuid NOT NULL` (referencia `instituicoes.id`)
- `criado_por_user_id uuid NOT NULL`
- `responsavel_user_id uuid NULL` (platform_admin atribuído)
- `tipo` enum: `tecnico | comercial | cobranca | contrato_documento |
  duvida_operacional | melhoria | incidente`
- `origem text` (ex.: `Sessões Públicas`, `Assistidos`, `Plano e Assinatura`)
- `assunto text NOT NULL`
- `descricao text NOT NULL`
- `codigo_tecnico text NULL` (ex.: `SESSOES_PUBLICAS_INSERT_DENIED`)
- `prioridade` enum: `baixa | normal | alta | urgente`
- `status` enum: `aberto | em_analise | aguardando_cliente |
  aguardando_administrador_global | aguardando_documento | resolvido |
  cancelado`
- `visibilidade` enum: `instituicao | autor_e_platform_admin`
- timestamps padrão + `concluido_em`

### `chamado_mensagens`
- `chamado_id uuid NOT NULL`
- `autor_user_id uuid NOT NULL`
- `mensagem text NOT NULL`
- `interno boolean NOT NULL DEFAULT false` (visível só para platform_admin)

### `chamado_anexos`
- `chamado_id uuid NOT NULL`
- `mensagem_id uuid NULL`
- `instituicao_id uuid NOT NULL`
- `enviado_por_user_id uuid NOT NULL`
- `nome_arquivo text NOT NULL`
- `storage_path text NOT NULL`
- `mime_type text NOT NULL`
- `tamanho_bytes bigint NOT NULL`

## 3. Storage

Bucket privado `suporte-anexos` (não público). Caminho:

```
<instituicao_id>/<chamado_id>/<uuid>-<nome>.<ext>
```

- Tipos aceitos: `png`, `jpg`, `jpeg`, `pdf`, `docx`, `xlsx`.
- Limite por arquivo: 10 MB.
- Máximo por mensagem/chamado: 5 arquivos (configurável em regras
  operacionais).
- Download sempre por **signed URL curta** (`createSignedUrl`, TTL ≤ 5 min).
  Nunca URL pública.

## 4. RLS

Fonte de verdade é o backend. Padrões:

### `chamados_suporte`
- `platform_admin`: `USING (true) WITH CHECK (true)` para todas as operações.
- `admin_instituicao`: `USING/WITH CHECK
  (fn_is_admin_instituicao(auth.uid(), instituicao_id))`.
- Autor (usuário comum/assistido): `USING (criado_por_user_id = auth.uid() AND
  is_member_of_instituicao(auth.uid(), instituicao_id))`; `INSERT` idem no
  `WITH CHECK`.
- `anon`: sem policy → sem acesso.

### `chamado_mensagens`
- Segue o chamado pai: só quem enxerga o chamado enxerga a mensagem, com o
  filtro adicional `interno = false OR is_platform_admin(auth.uid())`.

### `chamado_anexos`
- Mesma regra do chamado pai + `instituicao_id` do anexo tem que bater com o
  do chamado (defesa em profundidade).
- Bucket `suporte-anexos`: policies em `storage.objects` refletindo o mesmo
  isolamento (checagem via join com `chamado_anexos.storage_path`).

## 5. Integração com erros técnicos amigáveis

- `lib/supabaseFriendlyErrors.ts` já produz `{code, message, operacao,
  entidade}`.
- `lib/abrirChamadoTecnico.ts` (stub deste FIX09) hoje **copia** o payload
  para a área de transferência.
- No FIX10, o mesmo helper passa a chamar uma RPC `fn_abrir_chamado_tecnico`
  que cria `chamados_suporte` (tipo `tecnico`) já preenchido com origem,
  código, mensagem, instituição e usuário. O modal permite adicionar
  descrição livre e anexar print.

## 6. Notificações

- Reaproveitar a fila usada pelo SAAS-06-B0.4 (solicitações comerciais):
  novo chamado gera evento para platform_admins com repetição controlada por
  `pg_cron` até que o status saia de `aberto`.
- Resposta do platform_admin gera notificação para o autor.

## 7. Auditoria

Registrar em `audit_logs` (padrão já em uso):
- criação/edição de chamado, mudança de status/responsável, upload/download de
  anexo sensível, mensagens marcadas como internas, tentativa negada por RLS
  (via edge function que registra o rejection reason amigável).

## 8. Interface

### Admin local / usuário / assistido
- `Suporte` no menu operacional: “Meus chamados”, “Novo chamado”, detalhe com
  histórico de mensagens, área de anexos, badge de status.

### Platform_admin
- `Portal Admin → Chamados`: fila global com filtros por instituição, tipo,
  status e prioridade; ações de responder, atribuir, solicitar documento,
  baixar anexo, alterar status.

## 9. Testes obrigatórios (a construir no FIX10)

- Fluxo positivo por perfil.
- Isolamento cross-tenant (admin local não vê chamados de outra casa).
- Assistido restrito aos próprios chamados.
- Upload: tipos válidos/ inválidos e limite de tamanho.
- Signed URL expira e não permite acesso público direto.
- Erro técnico amigável → “Abrir chamado técnico” → chamado criado com o
  código correto.
- Regressão: FIX01..FIX09, cadastro de assistido/voluntário, Portal do
  Cliente, permissões de tarefeiro.
- Invariante: projeto Tratamentos FER original permanece intocado.

## 10. Limites de escopo (não entram no FIX10)

- Chat em tempo real (usar polling/realtime só para status/contadores).
- Assinatura eletrônica embutida (contratos vão como anexo baixado/enviado).
- Faturamento — permanece em Plano e Assinatura.
