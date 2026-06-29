# Segurança e Governança

Documento formal de segurança da plataforma de gestão da casa espírita.
Consolida o modelo de controle de acesso, a validação técnica dos controles
sensíveis e o registro formal dos riscos aceitos.

- **Última revisão:** 2026-06-11
- **Responsável:** Administração / Equipe técnica
- **Próxima revisão recomendada:** 2026-12-11 (semestral) ou a cada nova frente sensível

---

## 1. Modelo de controle de acesso

A plataforma é **fechada** (sem cadastro público). O acesso é provisionado por
gestores. A autorização é feita em duas camadas:

1. **Frontend (roteamento):** `ProtectedRoute` (`src/components/ProtectedRoute.tsx`)
   aplica _fail-closed_ — uma rota que exige `allowedRoles` nunca renderiza até
   existir uma role resolvida E permitida. Sem sessão → `/login`. Senha
   temporária → forçado para `/reset-password`.
2. **Backend (RLS):** todas as tabelas do schema `public` têm RLS habilitada.
   As roles são armazenadas em `user_roles` (nunca em `profiles`) e verificadas
   pela função `SECURITY DEFINER` `has_role()`, evitando recursão de RLS e
   escalonamento de privilégio.

### Perfis (app_role)
`admin`, `entrevistador`, `tarefeiro`, `assistido`, `coordenador_de_tratamento`.

---

## 2. Validação técnica dos controles

Validação dirigida executada nesta frente (2026-06-11).

### 2.1 Rotas protegidas — OK
- Usuário sem role: `ProtectedRoute` redireciona para `/login` (role não resolvida → deny).
- Role inválida para a rota: redireciona para `/dashboard`.
- Perfil correto: acessa apenas rotas listadas em `allowedRoles` (ver `src/App.tsx`).

### 2.2 Perfis e dados pessoais — OK
- `profiles`: leitura apenas do próprio registro (`auth.uid() = user_id`); gestão só por `admin`.
  Coordenadores e tarefeiros **não** leem `profiles` de terceiros diretamente; nomes
  de equipe vêm da função `staff_names()` (retorna somente `user_id` + `nome_completo`,
  nunca CPF/endereço).
- `assistidos`: leitura escopada por role. Coordenador limitado por
  `assistido_belongs_to_coordinator()`. Proprietário (assistido) lê o próprio registro.
- `checkins_publicos`: leitura restrita a `admin`, `tarefeiro`,
  `coordenador_de_tratamento` e ao proprietário do registro. Não há leitura pública.

### 2.3 Auditoria — OK
- `audit_logs` **não possui** policy de INSERT/UPDATE/DELETE → o cliente não consegue
  inserir/forjar logs manualmente.
- Logs são gerados exclusivamente pela trigger `fn_audit_trigger()` (`SECURITY DEFINER`),
  que registra `INSERT/UPDATE/DELETE` com diffs JSON (`dados_anteriores`/`dados_novos`).
- Leitura de logs: apenas `admin`.

### 2.4 Avatar / storage — OK (endurecido no Lote 2 / 2026-06-29)
- Bucket `avatars` é público para **exibição** das imagens via URL pública direta
  (`/object/public/...`, `getPublicUrl`), endpoint que ignora RLS em buckets públicos.
- A **listagem pública** foi **removida**: a policy SELECT ampla para `public`
  (`bucket_id = 'avatars'`) foi eliminada — ela permitia que qualquer visitante
  enumerasse todos os arquivos e as pastas de topo (nomeadas por UID de usuário).
- Permanece apenas uma policy SELECT para o **dono** listar a própria pasta
  (`(storage.foldername(name))[1] = auth.uid()::text`), como defesa em profundidade.
- INSERT/UPDATE/DELETE em `storage.objects` exigem que o primeiro segmento do
  caminho seja `auth.uid()` (`(storage.foldername(name))[1] = auth.uid()::text`).
- `PhotoUpload.tsx` grava em `${uid}/${folder}/${uuid}.${ext}` → cada usuário só
  escreve/atualiza/apaga na própria pasta; não é possível sobrescrever arquivo de outro.
- Buckets `ia-biblioteca` e `termos-voluntarios` são **privados** (sem leitura pública).

### 2.5 Reset de senha — OK
- `profiles.senha_temporaria = true` força troca no primeiro acesso (`ProtectedRoute`).
- `ResetPassword.tsx` valida link de recuperação / sessão e limpa o flag após troca.
- Edge function `reset-password` usa logging estruturado sem expor a senha.

### 2.6 Check-in público — OK
- Validação do token/sessão feita por edge function (`checkin-publico`) com logging estruturado.
- QR expirado/ inválido falha de forma controlada (sem crash da tela pública — coberto por E2E).
- Deduplicação por nome/celular e rate limiting (`checkin_tentativas`) ativos.
- A leitura ampla de `sessoes_publicas` (que expunha o `token`) foi **removida**;
  agora só `admin`/`tarefeiro` leem a tabela.

### 2.7 Realtime / Postgres Changes — OK
- Realtime usa Postgres Changes; entregas respeitam as policies de SELECT da tabela.
- Como as policies de leitura são escopadas por role/propriedade, nenhum perfil recebe
  eventos de linhas que não poderia ler via API. Não há tabela sensível publicada em
  realtime sem RLS de leitura correspondente.

---

## 3. Revisão das funções SECURITY DEFINER

Todas com `SET search_path = public` e responsabilidade única:

| Função | Finalidade | Avaliação |
|---|---|---|
| `has_role` | Verifica role em `user_roles` | Mínimo privilégio; só lê 1 tabela. OK |
| `fn_audit_trigger` | Grava em `audit_logs` (trigger) | Única forma de inserir logs. OK |
| `staff_names` | Retorna apenas `user_id`+`nome_completo` | Expõe somente nome (não PII). OK |
| `registrar_presenca` | Registra presença com validações | Usa `auth.uid()` + checagem de papel (tarefeiro/admin/master); `anon` revogado. OK |
| `liberar_proximo_tratamento` | Libera próximo tratamento (trigger) | Escopo limitado ao assistido. OK |
| `assistido_belongs_to_coordinator` / `entrevista_*` | Escopo de coordenador | Apenas booleano de pertencimento. OK |
| `calc_quantidade_faltante`, `update_*` | Triggers utilitárias | Cálculo/atualização locais. OK |

**Endurecimento S1 / Lote 1 (2026-06-29):** a superfície anônima do lint `0028`
foi **eliminada**. Para todas as funções `public` antes executáveis por `anon`
(60 no total) foi feito `REVOKE EXECUTE ... FROM PUBLIC, anon`:

- **`registrar_presenca`** deixou de confiar em `p_registrado_por`; agora usa
  `auth.uid()` como fonte de verdade do registrador e valida internamente o papel
  autorizado (`tarefeiro`, `admin`, `administrador_master`). `anon` revogado.
- **Funções 100% internas** (`fn_enqueue_notificacao`, `fn_promover_proxima_sessao`,
  `marcar_envio_concluido`) tiveram `anon` **e** `authenticated` revogados — só
  executam via `service_role`/contexto interno (são chamadas dentro de outras
  funções `SECURITY DEFINER`/triggers, que rodam como owner).
- **Demais RPCs** passaram a exigir login (`authenticated` mantido/garantido).
- **Funções de gatilho** tiveram `anon`/`PUBLIC` revogados por consistência
  (triggers não precisam de `EXECUTE` para disparar).

Resultado: `0028` (anon) = **0**.

### Endurecimento S1 / Lote 3 (2026-06-29) — consolidação do `0029`

Revisão nominal das funções `SECURITY DEFINER` ainda executáveis por `authenticated`
(80 ocorrências do lint `0029` antes do Lote 3 = 67 RPCs + 13 funções de gatilho):

- **Risco residual real corrigido (sem checagem interna + dado sensível):**
  - `lista_usuarios_email` — retornava o e-mail de **todos** os usuários sem checagem.
    Agora exige internamente `admin`/`administrador_master`.
  - `staff_names` — retornava o diretório de nomes de perfis sem checagem.
    Agora exige papel de equipe (`admin`/`master`/`entrevistador`/`coordenador_de_tratamento`/`tarefeiro`),
    bloqueando `assistido`.
- **Funções 100% internas (só chamadas por edge function via `service_role`):**
  `comunicadores_elegiveis` e `fila_humana_pendente` tiveram `authenticated` revogado
  (mantido `service_role`). Saíram da superfície do `0029`.
- **Funções de gatilho (13):** `authenticated`/`anon`/`PUBLIC` revogados — disparam como
  owner e não precisam de `EXECUTE` de usuário. Saíram da superfície do `0029`.

Resultado: lint `0029` reduzido de **80 → 65**. As **65** remanescentes são
**arquitetura intencional** (ver padrão abaixo e §5/R3): RPCs de negócio que exigem
login e fazem checagem interna de papel, helpers booleanos/escopados que sustentam
RLS/policies (`has_role`, `is_active_*`, `*_belongs_to_coordinator`, `fn_coordena_tratamento`),
ou funções que só leem/operam sobre o próprio `auth.uid()`.

### Padrão formal: `SECURITY DEFINER` como fronteira de autorização

1. **Sem `anon`.** Nenhuma função `public` é executável anonimamente (`0028` = 0).
2. **Toda RPC de negócio executável por `authenticated` faz checagem interna de papel**
   (`has_role(auth.uid(), ...)`) ou opera apenas sobre o próprio `auth.uid()`.
3. **Funções 100% internas** não têm `authenticated`/`anon` — só `service_role`/owner.
4. **Funções de gatilho** não têm `EXECUTE` de usuário (disparam como owner).
5. **Helpers de RLS** (booleanos) **precisam** ser executáveis por `authenticated` para
   as policies funcionarem — `0029` neles é esperado e aceitável.

Sob esse padrão, o `0029` deixa de ser "porta aberta": é apenas o registro de que a
autorização vive **dentro** da função (fronteira `SECURITY DEFINER`), não no GRANT.

---

## 4. Revisão do bucket de avatar (lint 0025 — RESOLVIDO no Lote 2)

- **Dado armazenado:** fotos de perfil e imagens institucionais (campanhas/eventos);
  não sensível por si, mas as **pastas de topo** eram nomeadas por **UID de usuário**.
- **Achado real (lint `0025`):** o bucket público `avatars` tinha policy SELECT ampla
  para `public`, permitindo `POST /object/list/avatars` por **anon** — confirmado em
  teste: retornava a lista de pastas com UIDs reais (enumeração de PII).
- **A listagem pública é necessária?** **Não.** Nenhum código usa `storage.list()`; a
  exibição usa exclusivamente `getPublicUrl` (endpoint público que ignora RLS). A
  geração de imagens institucionais (`conteudo-imagem-ia`) usa `service_role`.
- **Correção aplicada:** `DROP POLICY "Avatar images are publicly accessible"` e criação
  de policy SELECT restrita ao dono. A enumeração anônima foi **eliminada**.
- **Impacto:** **nenhum** — validado pós-migração:
  - `POST /object/list/avatars` (anon) → `[]` (antes: lista com UIDs).
  - `GET /object/public/avatars/<arquivo>` → `200` (exibição de imagens preservada).
  - uploads e visualização das imagens existentes inalterados.

**Conclusão:** lint `0025` **resolvido**; bucket permanece público apenas para
**exibição direta**, sem qualquer capacidade de listagem pública.

### Superfícies externas intencionais remanescentes
- **Exibição pública de imagens via URL direta** (`avatars`): intencional e necessária
  para renderizar fotos/imagens na UI; sem listagem, sem PII derivável da URL.
- **Edge functions públicas** (`checkin-publico`, `whatsapp-inbound`): mantêm validação
  própria de token/assinatura — não fazem parte do escopo de storage do Lote 2.

---

## 5. Riscos aceitos (formal)

### R1 — Configuração institucional legível
- **Descrição:** dados institucionais (nome, logo, CNPJ) legíveis por usuários autenticados.
- **Motivo:** branding/identidade exibido em toda a interface.
- **Mitigação:** sem PII de pessoas; gestão restrita a `admin`.
- **Impacto:** baixo. **Responsável:** Admin. **Revisão:** 2026-12-11.

### R2 — Bucket público de avatar (exibição direta) — RESOLVIDO (Lote 2)
- **Descrição:** leitura pública das imagens via URL direta. **Listagem pública removida.**
- **Motivo:** exibição de fotos/imagens na UI via URL pública (`getPublicUrl`).
- **Mitigação:** policy SELECT ampla para `public` removida; SELECT restrito ao dono;
  escrita isolada por usuário. Sem capacidade de enumeração anônima (lint `0025` = 0).
- **Impacto:** baixo. **Responsável:** Admin. **Revisão:** 2026-12-11.

### R3 — Funções SECURITY DEFINER executáveis por autenticado (lint 0029) — CONSOLIDADO (Lote 3)
- **Descrição:** nenhuma função `public` é executável por `anon` (`0028` = 0). Permanecem
  **65** funções `SECURITY DEFINER` chamáveis por `authenticated` (`0029`).
- **Motivo:** são (a) RPCs de negócio que exigem login e validam papel internamente,
  (b) helpers booleanos/escopados que sustentam RLS/policies (`has_role`, `is_active_*`,
  `*_belongs_to_coordinator`), ou (c) funções que só operam sobre o próprio `auth.uid()`.
- **Mitigação:** padrão formal "SECURITY DEFINER como fronteira de autorização" (§3):
  autorização vive dentro da função. Lote 3 corrigiu os 2 casos reais sem checagem
  (`lista_usuarios_email`, `staff_names`), removeu `authenticated` de 2 funções internas
  (`comunicadores_elegiveis`, `fila_humana_pendente`) e dos 13 gatilhos.
- **Impacto residual:** baixo e **aceito por arquitetura**. **Responsável:** Equipe técnica.
  **Revisão:** 2026-12-11.

### R4 — Realtime baseado em Postgres Changes
- **Descrição:** entrega de eventos em tempo real.
- **Motivo:** atualização ao vivo de avisos/agenda.
- **Mitigação:** respeita as policies de SELECT (RLS) de cada tabela.
- **Impacto:** baixo. **Responsável:** Equipe técnica. **Revisão:** 2026-12-11.

### R5 — Tarefeiro lê dados de todos os assistidos (plantão global)
- **Descrição:** a role `tarefeiro` lê toda a tabela `assistidos` (inclui CPF/endereço).
- **Motivo:** o módulo de presença opera em **plantão global** — o tarefeiro precisa
  identificar qualquer assistido agendado no dia para registrar presença.
- **Mitigação:** role atribuída apenas a voluntários de confiança; notas internas
  restritas não são expostas; toda ação é auditada por trigger.
- **Impacto:** médio. **Responsável:** Admin. **Revisão:** 2026-12-11.
- **Ponto residual:** avaliar futura visão escopada/colunar para reduzir PII exposta
  ao tarefeiro sem quebrar o plantão global.

---

## 6. Pontos residuais menores (não bloqueantes)

- **Entrevistador sem leitura de `checkins_publicos`:** intencional hoje; reavaliar se
  surgir necessidade operacional de revisar histórico de check-in.
- **Voluntário sem auto-leitura de `voluntarios`:** voluntários não possuem conta de app;
  registro é gerido por `admin`. Sem ação necessária no momento.

---

## 7. O que nunca deve acontecer

- Usuário não autenticado acessar rota protegida ou dados de assistidos.
- Cliente inserir/alterar `audit_logs` manualmente.
- Um usuário escrever/sobrescrever arquivos na pasta de avatar de outro.
- Assistido ler tokens de QR de sessões públicas.
- Roles armazenadas fora de `user_roles`.
- Exposição de CPF/endereço de `profiles` a coordenadores/tarefeiros via leitura direta.

---

## 8. Endurecimento técnico (Fase de prontidão)

### 8.1 Autorização fail-closed no frontend
- A resolução de papel/perfil (`AuthContext`) **nunca** assume `assistido` por falha de
  leitura. Em erro de rede/HTTP, `role` fica `null`, `roles` vazio e
  `rolesResolved=false`.
- `ProtectedRoute` só renderiza conteúdo protegido quando `rolesResolved=true`.
  Enquanto a autorização não estiver validamente resolvida, exibe carregamento
  (fail-closed) — não libera acesso por padrão permissivo.

### 8.2 CORS por allowlist nas edge functions
- Origem refletida apenas para superfícies legítimas (`supabase/functions/_shared/cors.ts`):
  - `tratamentos-fer.lovable.app` e qualquer host `*.lovable.app`, `*.lovableproject.com`,
    `*.lovable.dev` (preview/sandbox);
  - `localhost` / `127.0.0.1` (desenvolvimento).
- Origens fora da lista recebem `Access-Control-Allow-Origin: null` (bloqueado pelo browser).
- Webhooks (`whatsapp-inbound`) e cron (`alertas-operacionais`, `notificacoes-dispatch`)
  são server-to-server (sem header `Origin`): a proteção principal continua sendo
  segredo/assinatura/JWT — CORS não é a barreira de segurança desses fluxos.
- Funções endurecidas: `request-signup`, `manage-signup`, `manage-user`, `mfa-manager`,
  `create-user`, `reset-password`, `whatsapp-responder`, `whatsapp-inbound`,
  `notificacoes-dispatch`, `alertas-operacionais`, `assistente-entrevista`,
  `insights-dashboard`, `checkin-publico` e `_shared/auth.ts`.

### 8.3 Headers/CSP no frontend (`index.html`)
- `Content-Security-Policy` conservadora: `default-src 'self'`, `object-src 'none'`,
  estilos/fontes liberados para Google Fonts, `connect-src` para Supabase/realtime,
  imagens `https:`/`data:`/`blob:`.
- `Referrer-Policy: strict-origin-when-cross-origin` e `X-Content-Type-Options: nosniff`.
- `frame-ancestors` **não** é restringido por meta para não quebrar o preview do editor;
  framing real deve ser endurecido via header HTTP quando houver controle de borda.

### 8.4 Adiado para etapa posterior
- Headers HTTP de borda (`Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`,
  `Permissions-Policy`) dependem de configuração no provedor de hospedagem.
- Endurecimento global de tipagem (`strict` no tsconfig) e remoção ampla de `any` em
  módulos não críticos — fazer de forma incremental para evitar regressões em massa.
