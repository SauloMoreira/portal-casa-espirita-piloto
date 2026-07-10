# SAAS-06-C1 — Central de Chamados com Anexos (FIX10)

Status: **implementado**. Substitui a preparação anterior.

## 1. Objetivo

Central de suporte multi-tenant dentro do Portal Casa Espírita SaaS para
registrar chamados técnicos, comerciais, de cobrança, dúvidas operacionais,
contratos/documentos, melhorias e incidentes, com anexos privados por
instituição, histórico auditável e visão global para o administrador da
plataforma.

## 2. Tabelas criadas (migração `SAAS-06-C1-FIX10`)

- `public.chamados_suporte` — chamado com `instituicao_id`, tipo, assunto,
  descrição, código técnico, prioridade, status, visibilidade, metadata,
  autor e responsável.
- `public.chamado_mensagens` — thread do chamado; `interno=true` só é visto
  por `platform_admin`.
- `public.chamado_anexos` — metadado dos arquivos, com `storage_path`
  vinculado ao bucket privado.
- ENUMs: `chamado_tipo`, `chamado_status`, `chamado_prioridade`,
  `chamado_visibilidade`.
- Trigger `updated_at` em `chamados_suporte`.
- Índices por `(instituicao_id, status, created_at)` e por autor.

`GRANT` foi emitido só para `authenticated` (INSERT/UPDATE conforme a tabela)
e `service_role`. `anon` continua sem acesso.

## 3. Storage

Bucket privado `suporte-anexos` (não público). Layout de caminhos:

```
<instituicao_id>/<chamado_id>/<uuid>-<nome-arquivo>
```

- Tipos aceitos: PNG, JPG, PDF, DOCX, XLSX.
- Limite por arquivo: 10 MB (CHECK constraint + validação client-side).
- Máx. 5 arquivos por envio (guardado no front).
- Download sempre por `createSignedUrl` com TTL curto (5 min).

Policies em `storage.objects`:
- `suporte_anexos_select`: autenticado, restrito a caminhos referenciados por
  `chamado_anexos` (RLS da tabela filtra visibilidade real).
- `suporte_anexos_insert`: autenticado que seja `platform_admin` ou tenha
  vínculo ativo com a instituição do primeiro segmento do path.
- `suporte_anexos_delete`: apenas `platform_admin`.

## 4. RLS (fail-closed)

Regras aplicadas a `authenticated`. Sem policy para `anon`.

### `chamados_suporte`
- `SELECT`: `is_platform_admin(auth.uid())` OR
  `fn_is_admin_instituicao(auth.uid(), instituicao_id)` OR
  `criado_por_user_id = auth.uid()`.
- `INSERT`: autor = `auth.uid()` **E** (platform_admin OR admin do tenant OR
  vínculo `ativo` na instituição).
- `UPDATE`: platform_admin OR admin do tenant. Usuário comum não altera
  chamado.

### `chamado_mensagens`
- Herda visibilidade do chamado pai.
- `interno=true` só é visível para `platform_admin`.
- `INSERT` exige `autor = auth.uid()`, `instituicao_id` casando com o chamado,
  e autor com direito de ver o chamado. Notas internas só podem ser criadas
  por `platform_admin`.

### `chamado_anexos`
- Herda visibilidade do chamado pai (`SELECT`).
- `INSERT` exige `enviado_por_user_id = auth.uid()` e `instituicao_id` igual
  ao do chamado (defesa em profundidade contra path traversal).

## 5. RPC `fn_abrir_chamado_tecnico`

SECURITY DEFINER, `REVOKE` de `anon`/`PUBLIC`, `GRANT EXECUTE` para
`authenticated`. Recebe `instituicao_id`, origem, assunto, descrição, código
técnico e metadata JSON. Valida vínculo ativo (ou platform_admin), grava o
chamado como `tipo=tecnico`, prioridade `normal`, status `aberto`, e escreve
`audit_logs` com marcador `saas06_c1_fix10_chamados:criado_tecnico`.

Chamada pelo helper `src/lib/abrirChamadoTecnico.ts` a partir do botão
"Abrir chamado técnico" do toast de erro amigável. Fallback UX copia o
resumo técnico para a área de transferência.

## 6. Frontend

- Serviço: `src/lib/chamados.ts`
  - `criarChamado`, `listarChamados`, `obterMensagens`, `obterAnexos`,
    `enviarMensagem`, `enviarAnexo`, `urlAssinadaAnexo`, `atualizarStatus`,
    `atribuirResponsavel`.
  - Validação client-side de MIME e tamanho.
- Página `src/pages/Chamados.tsx` com prop `scope`:
  - `scope="local"` (rota `/chamados`, sidebar Início → Chamados): admin
    local vê tudo do tenant; usuário comum vê os próprios chamados. Botão
    "Novo chamado" fica travado quando não há instituição ativa.
  - `scope="global"` via `src/pages/PortalChamados.tsx` (rota
    `/portal/admin/chamados`, guardada por `PlatformAdminRoute`): visão de
    todas as instituições com filtro de tenant/tipo/status.
- Detalhe em `<Sheet>` com histórico de mensagens, upload de anexos,
  download por URL assinada, alteração de status (platform_admin) e nota
  interna (platform_admin).

## 7. Integração com o helper de erros amigáveis

`src/lib/supabaseFriendlyErrors.ts` continua sendo a única fonte de
mensagens amigáveis. O botão "Abrir chamado técnico" (já usado em Sessões
Públicas) agora persiste em `chamados_suporte` via RPC e mantém o fallback
de clipboard. Nenhum termo técnico (SQLSTATE, "row-level security", nome de
tabela) é exposto ao usuário.

## 8. Auditoria

Marcador padrão: `saas06_c1_fix10_chamados:<evento>`. Nesta versão, gravamos
`criado_tecnico`. Eventos adicionais (resposta, anexo, mudança de status)
podem ser adicionados via triggers em iteração futura sem quebrar contratos.

## 9. Fora do escopo (FIX10)

- Assinatura digital automática.
- Integração WhatsApp/e-mail externo.
- SLA e escalonamento cronado (reaproveitar padrão do SAAS-06-B0.4 fica
  como próximo passo).
- Chat em tempo real / realtime channels.

## 10. Anti-regressão

- Nada em módulos, planos, assinaturas, tratamentos FER ou superfícies
  globais foi alterado.
- `tsgo --noEmit` limpo após a mudança.
- Nenhum GRANT novo para `anon`/`PUBLIC`.
- Ninguém, além de `platform_admin`, altera status de chamado de outra
  instituição.

## 11. FIX12 — Suporte a .txt e download seguro

Durante a homologação manual, um chamado com anexo `.txt` mostrava "Sem anexos"
porque o CHECK `chamado_anexos_mime` e o validador do cliente rejeitavam
`text/plain`. Correções:

- **Migração:** `chamado_anexos_mime` agora aceita
  `text/plain` além dos tipos anteriores. Limite de 10 MB e demais políticas RLS
  permanecem inalterados.
- **Client (`src/lib/chamados.ts`):** `MIME_PERMITIDOS` inclui `text/plain`;
  `ACCEPT_ATTR` combina MIME + extensões (`.txt`, `.png`, `.jpg`, `.jpeg`,
  `.pdf`, `.docx`, `.xlsx`) para navegadores que enviam MIME vazio;
  `resolveMimeType` normaliza o `contentType` do upload e o `mime_type`
  gravado, evitando falhas silenciosas quando o browser reporta
  `application/octet-stream`.
- **Mensagem amigável:** "Tipo de arquivo não permitido. Envie PNG, JPG, PDF,
  DOCX, XLSX ou TXT."
- **Download:** `urlAssinadaAnexo` usa `createSignedUrl(..., { download })`,
  forçando download com o nome original — corrige o caso do platform_admin
  que abria `.txt` inline. TTL segue em 5 min, bucket segue privado.
- **UX:** ao anexar no detalhe do chamado, agora exibimos toast de sucesso
  ("Anexo enviado com sucesso.") e mensagem de erro amigável no download
  ("Não foi possível baixar o anexo. Se o problema continuar, verifique as
  permissões do storage.").

Sem alteração de RLS/GRANT/bucket/policies. Escopo global (platform_admin) e
local (admin da instituição/criador) permanece o mesmo — apenas o CHECK de
MIME foi ampliado e o cliente foi endurecido contra `file.type` vazio.
