# SAAS-01 — Blueprint e Arquitetura Multi-tenant

**Projeto:** Plataforma Casa Espírita SaaS (remix a partir de Tratamentos FER)
**Status:** Planejamento — sem alteração produtiva
**Recorte:** Documentação arquitetural. Nenhuma migração, código ou schema é criado neste recorte.

---

## 1. Contexto

- O projeto atual (Tratamentos FER) permanece como produção assistida single-tenant da Fraternidade Espírita Ramatis.
- Este projeto (remix) é a base da evolução SaaS multi-tenant.
- A FER poderá futuramente ser migrada como **primeiro tenant**, apenas após validação da arquitetura.
- Massa de dados aqui é **sintética/demo**. Proibido copiar dados reais sem anonimização.

## 2. Objetivo do Blueprint

Definir o modelo de isolamento entre instituições (tenants) da plataforma SaaS, com justificativa técnica, operacional e de segurança, e traçar o caminho de evolução.

## 3. Abordagens Avaliadas

### 3.1 Row-level multi-tenant (banco único, `instituicao_id` + RLS)

- Banco único, todas as tabelas de domínio ganham coluna `instituicao_id NOT NULL`.
- Isolamento garantido por **RLS**: toda policy filtra `instituicao_id = current_tenant()`.
- Papéis (`user_roles`) escopados por instituição: `(user_id, instituicao_id, role)`.
- Administração global da SC Moreira Tech via role de plataforma (`platform_admin`) fora do escopo tenant.

**Prós**
- Menor custo operacional (1 banco, 1 pool, 1 pipeline de migração).
- Onboarding de nova instituição = 1 INSERT em `instituicoes`.
- Relatórios consolidados (SC Moreira Tech) são queries diretas.
- Compatível com o desenho atual da FER (mesmo Postgres, mesmas RPCs `SECURITY DEFINER`), com **conversão incremental** — não exige reescrever RLS do zero.
- Backups, observabilidade, edge functions e Realtime funcionam sem particionamento adicional.

**Contras / Riscos**
- Vazamento entre tenants é **catastrófico**: uma policy esquecida expõe todas as instituições. Exige testes automatizados de isolamento (INV-TENANT-*).
- Tabela grande = índices precisam obrigatoriamente incluir `instituicao_id` como primeira coluna nos padrões de acesso multi-tenant.
- Barulhento no vizinho (noisy neighbor): tenant grande pode degradar performance dos demais.
- LGPD: "direito ao esquecimento" exige DELETE cirúrgico, não drop de schema.

### 3.2 Schema por tenant (banco único, 1 schema PostgreSQL por instituição)

- 1 banco, N schemas (`tenant_fer`, `tenant_xyz`, …), estrutura clonada.
- Isolamento por `search_path` + GRANTs por schema.

**Prós**
- Isolamento físico mais evidente; policies RLS simplificam (não precisam de `instituicao_id`).
- DELETE de tenant = `DROP SCHEMA` (LGPD facilitada).
- Migrações podem ser aplicadas por tenant (útil para pilotos).

**Contras / Riscos**
- Migrações **N vezes** — a cada tenant novo, propagação manual/scripts. Falha parcial deixa tenants em versões diferentes.
- Supabase (PostgREST, Realtime, Auth) opera com forte assunção do schema `public`. Suporte a schemas dinâmicos é **limitado e frágil**.
- Edge Functions precisariam resolver schema por request.
- Relatórios consolidados exigem `UNION ALL` sobre N schemas — inviável a partir de dezenas de tenants.
- Custo operacional cresce linearmente.

### 3.3 Banco por tenant (1 projeto Supabase por instituição)

- Cada instituição = 1 projeto Supabase isolado.

**Prós**
- Isolamento máximo. Vazamento entre tenants é fisicamente impossível.
- Compliance de dados por região facilitada.
- Noisy neighbor eliminado.

**Contras / Riscos**
- Custo cresce linearmente **e é alto** (billing Supabase por projeto).
- Onboarding = provisionar projeto, aplicar migrações, criar Auth, configurar secrets, deploy de edge functions. Não é 1 INSERT.
- Autenticação entre bancos exige camada federada (usuário único em N projetos → complexo).
- Relatórios consolidados exigem pipeline ETL externo.
- Administração global (SC Moreira Tech) exige console próprio que agrega N projetos.
- Inviável para o produto na fase inicial (validação, dezenas de casas espíritas de pequeno/médio porte).

## 4. Recomendação

**Adotar row-level multi-tenant (`instituicao_id` + RLS rigoroso) como arquitetura da v1 do SaaS.**

Justificativa consolidada:

| Critério | Row-level | Schema | Banco |
|---|---|---|---|
| Custo por tenant | **Baixo** | Médio | Alto |
| Onboarding | **1 INSERT** | Script + migração | Provisionar projeto |
| Migrações | **1x** | Nx | Nx |
| Relatórios consolidados | **Trivial** | UNION Nx | ETL externo |
| Isolamento | RLS (lógico) | Schema (lógico+) | Físico |
| Compatibilidade Supabase | **Nativa** | Frágil | Nativa |
| Continuidade com FER | **Alta** | Média | Baixa |
| Risco de vazamento | **Alto se RLS falhar** | Médio | Nulo |

Row-level é o melhor equilíbrio entre custo, velocidade de onboarding, aderência à stack Supabase e continuidade com o legado FER, **desde que** os controles obrigatórios da seção 5 sejam implementados e testados como bloqueantes de CI.

## 5. Controles Obrigatórios (row-level)

Sem estes controles, a arquitetura **não pode ir a produção**.

### 5.1 Modelo de dados

- Tabela `instituicoes (id, nome, slug, status, criado_em, plano_id, …)`.
- Coluna `instituicao_id uuid NOT NULL REFERENCES instituicoes(id)` em **toda** tabela de domínio.
- `user_roles` reescrito como `(user_id, instituicao_id, role, UNIQUE(user_id, instituicao_id, role))`.
- Tabela `platform_admins (user_id)` para SC Moreira Tech — **fora** do modelo tenant.
- Índices compostos: **todo** índice de tabela tenantizada começa por `instituicao_id`.

### 5.2 Contexto de tenant

- Função `SECURITY DEFINER` `public.current_tenant() returns uuid` que resolve o tenant ativo do JWT (claim `app_metadata.instituicao_id` ou tabela de membership + tenant "selecionado" na sessão).
- Função `public.has_role_in_tenant(_user, _tenant, _role)` substitui o atual `has_role`.
- Toda RPC `SECURITY DEFINER` recebe `instituicao_id` explícito ou o resolve via `current_tenant()`, **nunca** confia no cliente.

### 5.3 RLS

- Toda tabela tenantizada: `ENABLE ROW LEVEL SECURITY` + policies que filtram por `instituicao_id = public.current_tenant()`.
- `platform_admin` tem policy dedicada (bypass controlado, auditado).
- **Nenhuma** policy pode existir sem filtro de tenant. Enforcement por teste automatizado (linter customizado + suíte de isolamento).

### 5.4 Testes de isolamento (INV-TENANT-*)

- Suíte E2E-RLS (herdada da FER) estendida com **matriz de tenants** — para cada tabela sensível, dois tenants A e B: usuário de A **jamais** enxerga linha de B (SELECT, INSERT com FK cruzada, UPDATE, DELETE, RPC).
- Bloqueante em CI (gate `test:e2e:rls`).
- Fuzz test: gerar tenants aleatórios e provar que a interseção de resultados é vazia.

### 5.5 Auth e onboarding

- Signup de instituição: fluxo público controlado (aprovação manual da SC Moreira Tech) → cria `instituicoes` + primeiro `admin` local do tenant.
- Convite de usuário é sempre por tenant.
- Usuário pode pertencer a N tenants (membership); UI mostra seletor de tenant no header.
- `app_metadata.instituicoes[]` no JWT + tenant ativo em cookie/session.

### 5.6 Auditoria

- Toda tabela de auditoria carrega `instituicao_id` e `actor_platform_admin boolean`.
- Ações de `platform_admin` são **sempre** logadas com justificativa.

### 5.7 Storage

- Buckets particionados por prefixo `instituicao/{id}/…`. Policies de Storage filtram por prefixo derivado de `current_tenant()`.

### 5.8 Edge Functions

- Toda function extrai `instituicao_id` do JWT verificado e propaga em todas as queries. Nunca aceita `instituicao_id` do corpo sem validar membership.

## 6. Estratégia de Migração da FER para primeiro tenant

Fases (**não** executar neste recorte):

1. **Blueprint aprovado** (este documento).
2. **Fundação multi-tenant no SaaS**: criar `instituicoes`, `current_tenant()`, reescrever `user_roles`, adicionar `instituicao_id` em todas as tabelas com default temporário do tenant "FER".
3. **Refatorar RLS**: policies passam a exigir `instituicao_id = current_tenant()`.
4. **Suíte de isolamento verde** (bloqueante).
5. **Dry-run** com massa sintética de 2+ tenants demo.
6. **Corte da FER**: dump da produção assistida → import no SaaS com `instituicao_id = <fer_uuid>` → validação paralela → cutover controlado.
7. **Descomissionar** projeto FER original ou mantê-lo como cold standby por N meses.

## 7. Critérios para Migrar Futuramente para Schema/Banco por Tenant

Row-level é a v1. Reavaliar quando **qualquer** um destes ocorrer:

- Tenant enterprise exigir isolamento físico contratual (compliance regional, hospitalar, etc.).
- Uma tabela hot passar de ~500M linhas mesmo com particionamento por `instituicao_id`.
- Incidente de vazamento entre tenants (mesmo teórico) com causa em RLS.
- Custo de queries consolidadas superar custo de N projetos.
- Necessidade de residência de dados por país.

Estratégia de saída: schema-per-tenant é o próximo degrau natural (mesmo Postgres, isolamento mais forte, migrações automatizáveis por pipeline). Banco-per-tenant fica reservado para exceções contratuais.

## 8. Massa Demo / Sintética

- Nenhum dump da FER neste projeto.
- Seed script gera 2–3 instituições demo (`Casa Demo A`, `Casa Demo B`, `Centro Demo C`) com assistidos, agenda, voluntários e sessões públicas fictícios.
- Nomes gerados via biblioteca de nomes brasileiros fictícios. CPFs gerados pelo algoritmo mas **marcados como sintéticos** (flag no DB, prefixo `999.` reservado).
- Suíte E2E-RLS reusa o padrão de fixtures da FER (`e2e-rls-*@lovable.test`), **acrescida** de tenants A/B.

## 9. LGPD

- Consentimento e opt-out (WhatsApp e comunicação) já modelados na FER — herdar e escopar por `instituicao_id`.
- "Direito ao esquecimento": endpoint auditado que executa DELETE cirúrgico do assistido no tenant, preservando agregados anonimizados.
- Contrato de operador entre SC Moreira Tech (operadora) e cada instituição (controladora) — fora do escopo técnico.

## 10. O que este recorte **não** faz

- Não cria tabelas, migrações, edge functions ou código de tenancy.
- Não altera nada no projeto FER de produção.
- Não migra dados.
- Não configura billing/planos (recorte separado SAAS-XX).

## 11. Próximos Recortes Propostos

- **SAAS-02** — Fundação de tenancy: `instituicoes`, `current_tenant()`, refactor de `user_roles`, migração aditiva com `instituicao_id` default.
- **SAAS-03** — Refactor de RLS + suíte de isolamento INV-TENANT-* bloqueante.
- **SAAS-04** — Onboarding de instituição (signup + aprovação + primeiro admin local).
- **SAAS-05** — Seletor de tenant no header + membership multi-tenant.
- **SAAS-06** — Console de plataforma SC Moreira Tech (métricas consolidadas, auditoria, suspensão de tenant).
- **SAAS-07** — Billing/planos.
- **SAAS-08** — Cutover controlado da FER como primeiro tenant.

---

**Decisão de arquitetura registrada.** Nenhuma alteração produtiva foi feita.
