# SAAS-05-A — Matriz de Impacto da Tenantização do Módulo Tratamentos

**Status:** Diagnóstico e planejamento (não produtivo).
**Data:** 2026-07-07
**Escopo:** Exclusivamente inventário, classificação e plano. **Nenhuma** alteração de código produtivo, migration, RLS, RPC, edge function, UI funcional, dados ou projeto FER original foi executada neste recorte.

> Este documento é a base formal de decisão para os recortes SAAS-05-B a SAAS-05-H. A tenantização só pode iniciar após aprovação explícita desta matriz.

---

## 0. Convenções

Classificação de tenantização por tabela:

| Sigla | Significado |
|-------|-------------|
| **T-DIR** | Recebe coluna `instituicao_id` diretamente (NOT NULL após backfill) |
| **T-HER** | Herda `instituicao_id` por relacionamento (join com tabela pai T-DIR) |
| **G-GLB** | Global — permanece single-instance na plataforma (sem tenant) |
| **G-PAR** | Global parametrizada — template global + override por instituição |
| **A-ANA** | Requer análise adicional / decisão de produto antes de classificar |

Severidade de risco: **🔴 Alto** · **🟠 Médio** · **🟢 Baixo**.

---

## 1. Inventário de Tabelas Funcionais e Classificação

> Fonte: schema atual do módulo Tratamentos herdado da FER (163 migrations). A lista abaixo cobre as famílias funcionais solicitadas; nomes exatos das tabelas devem ser confirmados no SAAS-05-B via `information_schema`.

### 1.1 Núcleo assistencial

| Família | Tabelas representativas | Classificação | Justificativa |
|---------|-------------------------|---------------|---------------|
| Assistidos | `assistidos`, `assistidos_documentos`, `assistidos_enderecos` | **T-DIR** (raiz) + **T-HER** (filhas) | Assistido é o agregado raiz do módulo. Instituição é dona do cadastro. |
| Entrevistas | `entrevistas`, `entrevistas_respostas`, `entrevistas_ia_sugestoes`, `entrevistas_feedback_ia` | **T-HER** (via `assistido_id`) | Sempre pertence a um assistido de uma instituição. |
| Tratamentos (catálogo) | `tratamentos` | **G-PAR** | Catálogo doutrinário compartilhável + possibilidade de override/inclusão por instituição. Decisão final em 05-B. |
| Vínculo tratamento | `assistido_tratamentos` | **T-HER** (via `assistido_id`) | Vínculo é do assistido; herda tenant. |
| Agenda | `agenda_tratamentos_assistido` (fonte única INV), `agenda_slots`, `agenda_config` | **T-HER** + **T-DIR** (config) | Sessões herdam do assistido; parâmetros de agenda são por instituição. |
| Presenças | `presencas`, `presencas_publicas` | **T-HER** | Presença herda do vínculo/sessão. |
| Palestras / Trabalhos públicos | `palestras`, `sessoes_publicas`, `checkins_publicos` | **T-DIR** | Cada casa organiza sua programação pública. |
| Check-in público | `checkin_codigos`, `checkin_registros` | **T-DIR** | Código emitido por instituição; segurança crítica. |

### 1.2 Pessoas operacionais

| Família | Tabelas | Classificação | Justificativa |
|---------|---------|---------------|---------------|
| Voluntários / Tarefeiros | `voluntarios`, `voluntarios_funcoes`, `voluntarios_termos` | **T-DIR** | Vínculo trabalhador-instituição. Um voluntário pode atuar em múltiplas casas via múltiplos registros. |
| Funções de voluntariado | `funcoes_voluntariado` | **G-PAR** | Catálogo base + funções custom por instituição. |
| Perfis / papéis operacionais | `user_roles`, `profiles`, `instituicao_usuarios` | Já resolvido no SAAS-02 (`instituicao_usuarios` é T-DIR); `user_roles` e `profiles` permanecem **G-GLB** (identidade da pessoa é global). |

### 1.3 Comunicação e notificações

| Família | Tabelas | Classificação | Justificativa |
|---------|---------|---------------|---------------|
| Avisos internos | `avisos`, `avisos_leitura` | **T-DIR** | Aviso é publicado por uma instituição. |
| Notificações (fila) | `notificacoes_fila`, `notificacoes_dispatch_log`, `notificacoes_eventos` | **T-HER** + **T-DIR** (log) | Item de fila herda do alvo; log precisa `instituicao_id` explícito para auditoria e cotas. 🔴 |
| Templates | `notificacoes_templates`, `mensagens_templates` | **G-PAR** | Template padrão + override por instituição. |
| Consentimento WhatsApp | `consentimento_whatsapp`, `consentimento_versoes` | **T-DIR** | LGPD: consentimento é dado a uma casa específica. **INV-SEG**. 🔴 |
| Opt-out | `optout_whatsapp` | **A-ANA** | Decidir se opt-out é global (mais seguro para o usuário) ou por instituição. Recomendado **global fail-closed** (bloqueia envio em qualquer tenant). |
| Comunicação institucional (5A/5B) | `comunicacao_campanhas`, `comunicacao_mensagens` | **T-DIR** | |
| WhatsApp inbound | `whatsapp_mensagens_recebidas`, `whatsapp_sessoes` | **T-HER** (via `telefone`→assistido) + fallback **A-ANA** para números não identificados. 🟠 |
| IA WhatsApp métricas | `metricas_ia_whatsapp` | **T-DIR** | Métricas por casa. |
| Central de IA (base) | `ia_base_conhecimento`, `ia_site_conteudo` | **G-PAR** | Base doutrinária global + conteúdo institucional por casa. |

### 1.4 Governança operacional

| Família | Tabelas | Classificação | Justificativa |
|---------|---------|---------------|---------------|
| Parâmetros / configurações | `configuracoes_operacionais`, `parametros_sistema`, `regras_operacionais` | **T-DIR** | Cada casa afina suas regras. |
| Exceções operacionais | `excecoes_operacionais` | **T-DIR** | |
| Programação padrão | `programacao_padrao`, `programacao_dias` | **T-DIR** | |
| Ação social / Eventos / Campanhas | `acao_social_*`, `eventos`, `campanhas` | **T-DIR** | Iniciativas institucionais. |
| Waitlist / Coordenação | `waitlist_coordenacao`, `coordenacao_prioridades` | **T-HER** | |
| Documentos institucionais | `dados_institucionais` | ⚠️ Já é single-tenant hoje. Migrar para **T-DIR** com 1 linha por instituição. 🔴 |
| Cores / tema | `theme_colors`, `tema_config` | **T-DIR** | Motor de temas por casa. |
| Audit logs | `audit_logs`, `auditoria_*` | **T-HER** quando possível + coluna `instituicao_id` denormalizada para consultas rápidas. |
| MFA / Segurança | `mfa_*`, `security_events` | **G-GLB** (identidade) | Vinculado ao usuário, não à casa. |

### 1.5 Resumo quantitativo (estimado)

| Classe | Qtde aproximada de tabelas | Prioridade migration |
|--------|----------------------------|----------------------|
| T-DIR | ~22 | SAAS-05-B (lote 1) |
| T-HER | ~18 | SAAS-05-B (lote 2, após pais) |
| G-PAR | ~5 | SAAS-05-B (lote 3, com tabela override) |
| G-GLB | ~6 | Sem alteração |
| A-ANA | ~3 | Decisão em 05-B kickoff |

---

## 2. Inventário de RPCs / Functions Impactadas

Funções `SECURITY DEFINER` do módulo Tratamentos que hoje operam single-tenant. Todas precisam receber filtro por `instituicao_id` (via `current_setting('app.current_instituicao')` ou parâmetro explícito) em SAAS-05-E.

| Grupo | Funções representativas | Ação em 05-E |
|-------|-------------------------|--------------|
| Agenda | `fn_gerar_agenda_completa`, `fn_reconciliar_agenda`, `fn_validar_dia_semana` | Filtrar por tenant do assistido; garantir INV-AGD. |
| Entrevistas | `fn_entrevistas_operacional`, `fn_iniciar_entrevista`, `fn_encerrar_entrevista` | Preservar INV-SEG-004 + filtro tenant. 🔴 |
| Fila / Presença | `fn_registrar_presenca`, `fn_fila_motivo_inelegivel`, `fn_encerrar_item_fila`, `fn_enfileirar_mensagem_manual` | Tenant obrigatório; anti-vazamento. |
| Check-in público | `fn_validar_codigo_checkin`, `fn_registrar_checkin_publico` | Código carrega tenant embutido. 🔴 |
| Atribuição de tratamentos | `fn_liberar_proximo_sequencial`, `fn_vincular_tratamento` | Tenant do assistido. |
| Relatórios | `fn_relatorio_frequencia`, `fn_relatorio_faltas`, `fn_carga_tarefeiro`, `fn_trabalhos_publicos_*`, `fn_metricas_ia_whatsapp` | Todas devem receber `p_instituicao_id`; escopo do coordenador respeita `has_role` + tenant. 🔴 |
| Notificações / Avisos | `fn_notificar_ausencia`, `fn_dispatch_notificacoes`, `fn_publicar_aviso` | Tenant obrigatório; respeitar opt-out global. |
| Governança | `fn_saneamento_fila`, `fn_override_limite_diario`, `fn_promover_admin` | Escopo tenant + platform_admin bypass. |
| Helpers de acesso | `has_role`, `is_member_of_instituicao`, `is_platform_admin` | Novo helper `current_instituicao_id()` a criar em 05-C. |
| SECURITY DEFINER de leitura direta | ~30+ funções mapeadas em `MAPA-COBERTURA` | Auditar filtro tenant caso a caso. |

**Estimativa:** ~55–70 funções `SECURITY DEFINER` do módulo Tratamentos precisarão de revisão. Contagem exata em 05-B via `pg_proc` + tag `SAAS-TRATAMENTOS`.

---

## 3. Inventário de Edge Functions Impactadas

| Edge function | Impacto | Ação em 05-E |
|---------------|---------|--------------|
| `checkin-publico` | 🔴 Deve resolver tenant pelo código antes de qualquer leitura. |
| `notificacoes-dispatch` | 🔴 Loop precisa iterar por tenant; respeitar cotas e opt-out global. |
| `central-fila-alerta` | Filtrar fila por tenant do item. |
| `comunicacao-dispatch` | Envio por tenant; validar consentimento por tenant + opt-out global. |
| `alertas-operacionais` (cron) | Rodar por tenant (loop) para não vazar métricas entre casas. |
| `whatsapp-inbound` | Resolver tenant pelo número/consentimento antes de rotear. 🔴 |
| `whatsapp-responder` | IA precisa de contexto de tenant para respostas pessoais. 🔴 |
| `assistente-entrevista` | Contexto tenant obrigatório. |
| `insights-dashboard` | Agrupar por tenant; nunca cross-tenant. |
| `ia-site-ingestao` | Base institucional por tenant + base doutrinária global. |
| `conteudo-imagem-ia` | Assets por tenant. |
| `create-user` / `manage-user` / `manage-signup` / `request-signup` | Já parcialmente tenant-aware via `instituicao_usuarios` (SAAS-02). Revisar fluxo de convite. |
| `reset-password` / `mfa-manager` | **G-GLB** — identidade. Sem alteração. |
| `mcp` | Revisar por endpoint. |

---

## 4. Inventário de Frontend Impactado

### 4.1 Páginas (src/pages) — precisam consumir `InstituicaoContext`

Operacional (todas T-HER/T-DIR):
`Agenda`, `Assistidos`, `Entrevistas`, `FazerEntrevista`, `MigrarAssistido`, `Tratamentos`, `Presenca`, `Voluntarios`, `FuncoesVoluntariado`, `Avisos*`, `Notificacoes`, `CentralNotificacoes`, `CheckinPublico` (⚠️ público — tenant via código), `SessoesPublicas`, `MinhaAgenda`, `MeusTratamentos`, `MeuPerfil`, `MeusDocumentos`, `ConsultaAssistido`.

Coordenação: `CoordenadorAgenda`, `CoordenadorListaEspera`, `CoordenadorTratamentos`, `EscopoOperacional`, `Excecoes`, `ExcecoesOperacionais`, `HomologacaoAgenda`.

Governança/Config: `RegrasOperacionais`, `ProgramacaoPadrao`, `GovernancaAcessos`, `GovernancaParametros`, `Configuracoes`, `Instituicao`, `Usuarios`, `SolicitacoesCadastro`, `SolicitarCadastro`, `PainelInstitucional`, `Eventos`, `Campanhas`, `AcaoSocial`, `ComunicacaoInstitucional`, `GestaoCores`.

Analytics/IA: `Dashboard*`, `Relatorios`, `Auditoria`, `Observabilidade`, `CentralIA`, `AvisosAusencia`.

Portal (já SaaS-native): `Portal`, `PortalAdmin`, `PortalInstituicoes`, `PortalModulos` — sem alteração.

Identidade: `Login`, `ForgotPassword`, `ResetPassword`, `MfaVerify`, `SegurancaConta`, `SegurancaPrivacidade`, `OAuthConsent`, `CentralAjuda` — permanecem **G-GLB**.

### 4.2 Hooks impactados (src/hooks)

`useAgendaEntrevistas`, `useAgendaTratamentos`, `useAvisos`, `useCargaTarefeiro`, `useFaltasPorPeriodo`, `useFazerEntrevista`, `useFrequenciaPresenca`, `useIaIndicadores`, `useObservabilidade`, `useSessoesPublicas`, `useTrabalhosPublicos`, `useTratamentosConcluidos`, `useVoluntarios`, `useWhatsappPanelV2`, `useAdminDashboard` — todos devem passar a exigir `instituicao_id` (ler do `InstituicaoContext`).

Já SaaS-native: `usePortalHub`, `useSelectedInstituicao`, `useThemeColors` (revisar), `useHelp`, `use-mobile`, `use-toast`.

### 4.3 Services impactados (src/services)

`agenda*`, `assistidos`, `avisos`, `campanhas`, `comunicacaoInstitucional`, `conteudoImagem`, `coordenacao`, `dashboard`, `entrevistas`, `eventos`, `governanca`, `ia`, `notificacoes`, `observabilidade`, `painelInstitucional`, `presencas`, `programacao`, `relatorios`, `sessoesPublicas`, `voluntarios`, `acaoSocial` — todos devem propagar `instituicao_id` (parâmetro obrigatório em queries `.eq('instituicao_id', ...)` e RPCs).

Padrão sugerido (05-D): wrapper `withInstituicao(fn)` que injeta o tenant ativo automaticamente e falha fechado se ausente.

### 4.4 Rotas

- Rotas do Portal: já OK.
- Rotas operacionais: precisam de guard `RequireInstituicao` que redireciona ao Portal se `selecionada == null`.
- Rota pública `/checkin/:codigo`: resolve tenant pelo código; nunca depende do contexto do browser.

---

## 5. Impacto em RLS / Policies

### 5.1 Padrões atuais (single-tenant, herdados da FER)

Hoje as policies assumem que **todos os dados pertencem à mesma casa**. Padrões típicos:
- `USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'x'))`
- `USING (assistido_id IN (SELECT id FROM assistidos WHERE ...))`

### 5.2 Padrão alvo multi-tenant (SAAS-05-C)

```sql
USING (
  instituicao_id = public.current_instituicao_id()
  AND public.has_role_in_instituicao(auth.uid(), instituicao_id, 'papel')
)
```

### 5.3 Helpers a criar em 05-C

| Helper | Assinatura | Propósito |
|--------|-----------|-----------|
| `current_instituicao_id()` | `returns uuid` | Lê `app.current_instituicao` (setado por edge/RPC) ou única instituição do usuário. |
| `is_member_of_instituicao(_user, _inst)` | `returns boolean` | Confere `instituicao_usuarios` ativo. |
| `has_role_in_instituicao(_user, _inst, _role)` | `returns boolean` | Combina `user_roles` + membership. |
| `is_platform_admin(_user)` | Já existe (SAAS-02) — bypass controlado. |

### 5.4 Riscos de policy

- 🔴 **Vazamento cross-tenant** via subqueries que ignoram `instituicao_id`.
- 🔴 **Recursão** entre `assistidos` e `assistido_tratamentos` — resolver com SECURITY DEFINER helper.
- 🟠 **Coordenadores com escopo múltiplo** — precisa policy que aceite lista de instituições.
- 🟠 **Platform admin** — bypass explícito auditado.
- 🟢 **Anon** — permanece bloqueado exceto endpoint público de checkin.

---

## 6. Impacto em Relatórios

| Relatório | Impacto | Ação |
|-----------|---------|------|
| Frequência de presença | 🔴 Não pode agregar entre casas | RPC recebe `p_instituicao_id`; UI usa tenant ativo. |
| Faltas por período | 🔴 idem | idem |
| Tratamentos concluídos | 🔴 idem | idem |
| Carga por tarefeiro | 🔴 idem | idem + respeitar visibilidade do tarefeiro (INV atual). |
| Assistidos por tratamento | 🔴 idem | idem |
| Entrevistas realizadas | 🔴 idem | idem + INV-SEG-004. |
| Trabalhos públicos (demográfico) | 🔴 idem | idem |
| Dashboards Admin (9 blocos) | 🟠 | Filtro tenant + visão consolidada para platform_admin (opt-in). |
| Insights IA | 🟠 | Contexto tenant obrigatório antes do prompt. |
| Auditoria | 🟠 | `audit_logs.instituicao_id` denormalizado para consulta rápida. |

Exportações CSV (limite 10.000): manter, filtrando por tenant antes da agregação.

---

## 7. Estratégia para FER como Tenant Inicial (SAAS-05-F)

Objetivo: promover a FER a **primeira instituição real** sem perder histórico, auditoria, agenda ou notificações.

### 7.1 Passos propostos (a executar em 05-F, não agora)

1. **Criar** registro `instituicoes` da FER com ID conhecido (`fer_id`) e slug estável.
2. **Backfill idempotente** em ordem topológica (raiz → folhas):
   - `assistidos.instituicao_id = fer_id` para todo registro sem tenant.
   - `voluntarios.instituicao_id = fer_id`.
   - Tabelas T-DIR globais atuais (parâmetros, config, temas, dados_institucionais) → 1 linha FER.
   - Tabelas T-HER: derivar via join com pai (`UPDATE ... FROM assistidos`).
3. **Backfill de audit_logs**: coluna denormalizada preenchida via join.
4. **`instituicao_usuarios`**: promover todos os usuários ativos como membros da FER com o papel atual (mapeado 1:1 com `user_roles`).
5. **NOT NULL constraint** aplicada **somente após** validação de que 0 linhas ficaram nulas (`SELECT count(*) WHERE instituicao_id IS NULL = 0` em cada tabela).
6. **Assinatura**: FER recebe plano "Institucional Completo" com todos os módulos habilitados (compat retroativa).
7. **Rollback plan**: cada passo é uma migration idempotente reversível; snapshot pré-migração obrigatório.
8. **Verificação pós-migração**: rodar suíte `src/test/integration/db` com FER como tenant único → todos os 22 testes verdes.

### 7.2 Preservação obrigatória

- ✅ Histórico de sessões (agenda_tratamentos_assistido intocado — apenas coluna nova).
- ✅ Auditoria (JSON diffs preservados).
- ✅ Fila de notificações em voo (drain antes da migration).
- ✅ Consentimento WhatsApp (versão + trilha imutável).
- ✅ Relatórios (mesmos números após backfill, validados por checksum agregado).

---

## 8. Matriz de Riscos

| # | Risco | Severidade | Mitigação | Recorte |
|---|-------|------------|-----------|---------|
| R-01 | Dados sem `instituicao_id` após backfill | 🔴 | NOT NULL só depois de `count(null)=0` + fail-closed em todas as reads | 05-F |
| R-02 | SECURITY DEFINER sem filtro tenant | 🔴 | Auditoria linha a linha + testes de contrato multi-tenant | 05-E + 05-G |
| R-03 | Relatórios agregando casas diferentes | 🔴 | RPCs recebem `p_instituicao_id` obrigatório | 05-E |
| R-04 | Usuário em múltiplas instituições vê dados errados | 🔴 | `InstituicaoContext` + `current_instituicao_id()` + guard de rota | 05-C/D |
| R-05 | Check-in público sem contexto seguro | 🔴 | Código embute tenant assinado; validação server-side | 05-E |
| R-06 | Notificação enviada ao tenant errado | 🔴 | Item de fila tem `instituicao_id` NOT NULL; dispatcher itera por tenant | 05-E |
| R-07 | Templates globais sobrescritos por casa erroneamente | 🟠 | Padrão G-PAR: template global read-only + override por instituição | 05-B |
| R-08 | Migração pesada trava banco em produção | 🟠 | Migrations em lotes, `CREATE INDEX CONCURRENTLY`, janela de manutenção | 05-F |
| R-09 | Falta de índices em `(instituicao_id, ...)` | 🟠 | Criar índices compostos junto com a coluna | 05-B |
| R-10 | Vazamento via views/materialized views legadas | 🟠 | Auditoria de views + reescrita com filtro tenant | 05-C |
| R-11 | Opt-out WhatsApp por tenant permite spam cross-tenant | 🔴 | Opt-out **global fail-closed** (bloqueia todos os tenants) | 05-B decisão |
| R-12 | Platform_admin com bypass amplo demais | 🟠 | Bypass explícito auditado; nunca em RPC de escrita sem `p_instituicao_id` | 05-C |
| R-13 | Rota operacional acessada sem tenant selecionado | 🟠 | Guard `RequireInstituicao` redireciona ao Portal | 05-D |
| R-14 | Edge function cron mistura dados de tenants | 🔴 | Loop explícito por tenant + logs por tenant | 05-E |
| R-15 | IA WhatsApp responde com contexto de casa errada | 🔴 | Resolver tenant antes do prompt; nunca inferir do modelo | 05-E |
| R-16 | Tarefeiro perde INV-SEG-004 durante refactor | 🔴 | Testes de sigilo re-executados em cada PR | 05-G |
| R-17 | Divergência entre tipos gerados e schema | 🟠 | Regen types + `tsgo` em cada 05-* | Todos |
| R-18 | Dashboards do Portal quebrando com N instituições | 🟢 | Paginação já implementada (mem: paginação-escalabilidade) | 05-D |

---

## 9. Sequência Recomendada de Recortes Futuros

| Recorte | Objetivo | Depende de | Reversível? |
|---------|----------|------------|-------------|
| **SAAS-05-B** | Tenantização de schema: adicionar `instituicao_id` (nullable), índices, FKs. Sem NOT NULL, sem alterar RLS ainda. | 05-A aprovado | ✅ (drop column) |
| **SAAS-05-C** | Helpers RLS multi-tenant + policies novas em modo "shadow" (coexistem com policies atuais). | 05-B | ✅ |
| **SAAS-05-D** | Frontend: `InstituicaoContext` propagado a todos os services/hooks + `RequireInstituicao` guard. | 05-C | ✅ |
| **SAAS-05-E** | RPCs/edge functions recebem `p_instituicao_id` obrigatório; loops por tenant no cron. | 05-C, 05-D | 🟠 (funções versionadas) |
| **SAAS-05-F** | Migração FER→tenant inicial + NOT NULL + cutover de policies antigas → novas. Janela de manutenção. | 05-B..E verdes | 🟠 (snapshot obrigatório) |
| **SAAS-05-G** | Testes E2E multi-tenant + testes de vazamento cross-tenant (2ª instituição sintética). | 05-F | N/A |
| **SAAS-05-H** | Validação final: indicadores 0028/0025/0029, benchmarks, doc de encerramento. | 05-G | N/A |

**Bloqueios cruzados:**
- SAAS-02-S3 (hardening baixo) deve rodar **antes de 05-F** para não acumular hardening + migração.
- SAAS-06 aguarda 05-H.

---

## 10. Confirmação de Não-Alteração Produtiva

Neste recorte SAAS-05-A **não foram executados**:

- ❌ Nenhuma migration criada ou aplicada.
- ❌ Nenhuma coluna `instituicao_id` adicionada.
- ❌ Nenhuma RLS/policy criada, alterada ou removida.
- ❌ Nenhuma RPC/function criada ou alterada.
- ❌ Nenhuma edge function criada, alterada ou deployada.
- ❌ Nenhuma alteração em UI funcional, hooks ou services.
- ❌ Nenhum dado real alterado ou migrado.
- ❌ Nenhuma alteração no projeto FER original.
- ❌ SAAS-02-S3 não iniciado.

**Único artefato criado neste recorte:** este documento (`docs/SAAS-05-A-MATRIZ-TENANTIZACAO-TRATAMENTOS.md`).

---

## 11. `tsgo`

Não aplicável — recorte 100% documental, sem alteração de código TypeScript.

## 12. Indicadores Finais

| Indicador | Antes | Depois | Δ |
|-----------|-------|--------|---|
| 0028 (funções expostas anon/public) | 143 | **143** | 0 |
| 0025 (findings críticos) | 0 | **0** | 0 |
| 0029 (funções SECURITY DEFINER auditadas) | 56 | **56** | 0 |

Indicadores preservados — nenhuma superfície de segurança foi tocada.

---

## 13. Critério de Aceite

✅ Matriz clara, completa e priorizada para a tenantização do módulo Tratamentos, sem qualquer alteração produtiva.

**Próximo passo:** aprovação formal desta matriz antes de qualquer execução do SAAS-05-B.
