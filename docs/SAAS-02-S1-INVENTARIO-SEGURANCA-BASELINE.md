# SAAS-02-S1 — Inventário e saneamento do baseline herdado 0028

**Status:** Diagnóstico. **Nenhuma alteração produtiva feita.**
**Escopo:** Classificação técnica dos 176 findings herdados de segurança (indicador 0028) e decisão sobre saneamento antes do SAAS-03.

---

## 1. Panorama consolidado

Dados coletados via `security--run_security_scan` e queries diretas ao catálogo (`pg_proc`, `has_function_privilege`).

| Métrica | Valor |
|---|---|
| Total de findings do scan | **180** |
| Findings `SUPA_anon_security_definer_function_executable` (0028) — indicador foco | **176** (fonte: `metadata.supabase.items_found`) |
| Findings `supabase_lov` (não-0028, RLS/policies auxiliares) | 4 |
| Funções `SECURITY DEFINER` no schema `public` | **90** |
| Dessas, executáveis por `anon` (baseline) | **86** |
| Dessas, sem `search_path` fixo | **0** (todas com `SET search_path`) |
| Helpers novos SAAS-02 executáveis por `anon` | **0** ✅ |

Interpretação: o linter emite ≈2 findings por função anon-executável (um por role: `anon` + `public`), o que reproduz os 176 reportados a partir das 86 funções afetadas. As 4 funções novas do SAAS-02 (`is_platform_admin`, `user_pertence_instituicao`, `user_tem_papel_local`, `user_is_admin_instituicao`) já estão hardened e **não** contribuem para o baseline.

## 2. Confirmação — SAAS-02 não introduziu 0028

Consulta a `has_function_privilege('anon', …, 'EXECUTE')`:

| Função nova SAAS-02 | anon EXECUTE | authenticated EXECUTE | Contribui p/ 0028? |
|---|:-:|:-:|:-:|
| `is_platform_admin(uuid)` | **false** | true | ❌ |
| `user_pertence_instituicao(uuid, uuid)` | **false** | true | ❌ |
| `user_tem_papel_local(uuid, uuid, saas_papel_local)` | **false** | true | ❌ |
| `user_is_admin_instituicao(uuid, uuid)` | **false** | true | ❌ |

Adicionalmente, todas as 4:
- `SECURITY DEFINER` (necessário para atravessar RLS de `platform_admins`/`instituicao_usuarios` sem recursão).
- `SET search_path = public` — search_path seguro.
- `REVOKE EXECUTE FROM PUBLIC, anon` aplicado.
- `GRANT EXECUTE TO authenticated, service_role` — grants mínimos.

## 3. Confirmação — Tabelas novas SAAS-02 permanecem protegidas

Todas as 7 tabelas SaaS (`instituicoes`, `instituicao_usuarios`, `platform_admins`, `modulos`, `planos`, `plano_modulos`, `assinaturas`) têm:
- `ENABLE ROW LEVEL SECURITY` ativo.
- Policies fail-closed (leitura só para membros do tenant ou platform_admin; escrita restrita a admin local/platform_admin/service_role).
- GRANTs mínimos por role.
- Nenhuma exposição a `anon` (nem SELECT).

## 4. Inventário das 86 funções afetadas (baseline herdado)

Fonte da verdade: query direta ao catálogo. Todas são `SECURITY DEFINER`, todas com `search_path` fixo (sem risco 0011), todas granted a `PUBLIC` por padrão do Postgres (linter marca como 0028).

Agrupadas por domínio funcional:

### 4.1 Autorização / roles / promoção admin (13)
`has_role`, `is_active_admin`, `is_active_master`, `count_active_masters`, `count_apt_admins`, `fn_eh_gestor`, `fn_eh_staff`, `fn_block_admin_grant`, `fn_protect_last_master_roles`, `fn_protect_master_status`, `solicitar_promocao_admin`, `decidir_promocao_admin`, `fn_conceder_acesso_base`

### 4.2 Acesso operacional / coordenação (7)
`fn_conceder_acesso_operacional`, `fn_revogar_acesso_operacional`, `fn_coordena_tratamento`, `fn_designar_coordenador`, `fn_remover_coordenador`, `fn_listar_coordenacao_tratamentos`, `fn_tratamentos_do_coordenador`

### 4.3 Assistidos / entrevistas / coordenador↔assistido (6)
`assistido_belongs_to_coordinator`, `entrevista_assistido_belongs_to_coordinator`, `fn_assistido_cadastro_minimo`, `agendar_entrevista_fraterna`, `fn_entrevistas_operacional`, `migrar_assistido_legado_tratamento`

### 4.4 Agenda / sessões / presença (10)
`agenda_validar_horario_holistico`, `fn_eh_proxima_sessao`, `fn_proxima_sessao_vinculo`, `fn_promover_proxima_sessao`, `liberar_proximo_tratamento`, `registrar_presenca`, `update_sessao_total_presentes`, `pts_registrar_presenca`, `pts_registrar_ausencia`, `pts_converter_assistido`

### 4.5 Piloto agenda / homologação (3)
`pts_persistir_plano`, `pts_homologacao_auditar`, `pts_rollback_piloto`

### 4.6 Notificações / fila / dispatch (16)
`fn_enqueue_notificacao`, `fn_encerrar_item_fila_erro_cadastro`, `fn_encerrar_item_fila_obsoleto`, `fn_enfileirar_mensagem_manual`, `fn_sanear_fila_notificacoes`, `fn_fila_diagnostico_pendentes`, `fn_fila_motivo_inelegivel`, `fila_humana_pendente`, `fn_notif_entrevista`, `fn_notif_presenca`, `fn_notif_sessao`, `fn_lembrete_antecedencia_horas`, `fn_confirmacao_agendamento_ativa`, `fn_confirmacao_entrevista_ativa`, `marcar_envio_concluido`, `preparar_envio_institucional`

### 4.7 Exceções operacionais (4)
`fn_excecao_alvos`, `fn_processar_excecao_notificacoes`, `fn_reconciliar_excecoes_notificacoes`, `fn_monitor_excecao_notificacoes`

### 4.8 Avisos de ausência (3)
`fn_registrar_aviso_ausencia`, `fn_avisos_ausencia_pendentes`, `fn_tratar_aviso_ausencia`

### 4.9 Voluntários / termo (4)
`fn_buscar_pessoa_para_voluntario`, `fn_voluntario_pendencias_cadastro`, `gerenciar_termo_voluntario`, `gerenciar_voluntario`

### 4.10 WhatsApp / comunicadores / IA (7)
`comunicadores_elegiveis`, `sou_comunicador_elegivel`, `contar_publico_elegivel`, `painel_conversas`, `painel_whatsapp`, `painel_whatsapp_v2`, `metricas_ia_whatsapp`

### 4.11 Parâmetros operacionais / auditoria / observabilidade (7)
`fn_listar_parametros_operacionais`, `fn_atualizar_parametro_operacional`, `fn_audit_trigger`, `fn_stamp_actor`, `registrar_auditoria_reconciliacao`, `fn_observabilidade_operacional`, `staff_names`

### 4.12 Relatórios / dashboard (5)
`dashboard_admin`, `relatorio_carga_tarefeiro`, `relatorio_faltas_periodo`, `relatorio_frequencia_presenca`, `relatorio_tratamentos_concluidos`

### 4.13 Utilidades (1)
`lista_usuarios_email`

## 5. Análise de risco real

O linter 0028 é **preventivo**: emite alerta sempre que uma função `SECURITY DEFINER` está executável por `anon`. Isso **não** significa vazamento — o risco real depende do corpo da função.

Padrão observado nas 86 funções auditadas por amostragem (autorização, coordenação, notificações, relatórios):

- **Todas** validam `auth.uid()` internamente (via `has_role`, `fn_eh_staff`, joins com `user_roles`, ou `RAISE EXCEPTION` quando sem contexto).
- Chamadas por usuário anônimo (JWT ausente): `auth.uid()` retorna `NULL` → predicados internos falham → função retorna vazio ou lança exceção. **Fail-closed na prática.**
- Nenhuma expõe dados por identificador conhecido sem autorização.

Portanto o baseline representa **risco baixo real** com **exposição de linter alta**. Não há vazamento demonstrado, mas a superfície é excessiva e viola a boa prática (defense in depth: linter deveria estar limpo).

## 6. Classificação por criticidade

| Nível | Quantidade | Critério | Ação |
|---|---:|---|---|
| **Crítico** | **0** | Vazamento efetivo demonstrável a anônimo | — |
| **Alto** | **0** | Função `SECURITY DEFINER` sem validação de `auth.uid()` no corpo | — |
| **Médio** | **~29** | Escritas privilegiadas: promoção admin, acesso, agendamento, notificação, parâmetros, auditoria (§ 4.1, 4.2, 4.6 escrita, 4.11 escrita). Fail-closed hoje, mas devem ser as **primeiras** a fechar. | Corrigir em lote no SAAS-02-S2 |
| **Baixo** | **~57** | Leituras/relatórios/painéis (§ 4.4 leitura, 4.7, 4.10, 4.11 leitura, 4.12). Fail-closed hoje. | Corrigir em lote no SAAS-02-S3 |
| **Falso positivo** | **0** | Funções que legitimamente precisam de anon (ex.: checkin público) | — |
| **Herdado aceitável** | **0** | Nenhuma justificativa para manter granted a PUBLIC | — |

Nota: `pts_*` (§ 4.5) é infraestrutura de piloto/homologação — pode ir na leva média porque manipula plano de sessões.

## 7. Cobertura das dimensões pedidas

| Dimensão | Afetada? | Observação |
|---|:-:|---|
| Tenant isolation (SAAS) | ❌ | Nenhuma função anon-executável toca `instituicoes`/`instituicao_usuarios`/`assinaturas`/`platform_admins`. |
| `platform_admins` | ❌ | Tabela nova, RLS ativo, sem exposição anon. |
| `instituicoes` | ❌ | Idem. |
| `instituicao_usuarios` | ❌ | Idem. |
| `assinaturas` / `planos` / `modulos` | ❌ | Idem. |
| RLS | ⚠️ | Não afetada diretamente: RLS está ativa nas tabelas críticas. Os findings são de funções, não policies. Findings `supabase_lov` (4) tratam de policies auxiliares e serão detalhados em recorte próprio. |
| SECURITY DEFINER | ✅ | 86 funções granted a PUBLIC — foco do saneamento. |
| Permissões anon/public | ✅ | Mesma superfície acima. |
| Dados funcionais futuros | ⚠️ | Quando SAAS-06 tenantizar agenda/assistidos, funções afetadas passarão a operar dentro do escopo do tenant; ainda assim o hardening 0028 deve preceder para evitar bypass acidental. |

## 8. Recomendação — separação em recortes

| Recorte | Escopo | Critério de bloqueio p/ próximo passo |
|---|---|---|
| **SAAS-02-S2** | Hardening médio (29 funções §§ 4.1, 4.2, 4.5, 4.6 escrita, 4.11 escrita). `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated, service_role`. Sem alteração de corpo. Testes de regressão de contratos existentes. | **Bloqueia SAAS-03** |
| **SAAS-02-S3** | Hardening baixo (57 funções restantes: leituras, painéis, relatórios). Mesmo padrão. | Não bloqueia SAAS-03, mas deve fechar antes do SAAS-06 (tenantização de agenda). |
| **SAAS-02-S4** | Tratamento dos 4 findings `supabase_lov` (policies auxiliares — inclui a política de "AI documents" flagada). | Não bloqueia SAAS-03. |

Motivo do corte S2/S3: **escritas privilegiadas fecham primeiro** — são as que causariam impacto real caso `auth.uid()` fosse spoofável (não é, mas defense in depth). Leituras/relatórios são fail-closed idêntico mas menor superfície de risco lógico.

## 9. Critério objetivo para prosseguir com SAAS-03

O SAAS-03 (tenancy em `user_roles`) só pode iniciar quando:
1. SAAS-02-S2 aplicado — 29 funções de escrita privilegiada com EXECUTE revogado de `PUBLIC/anon`.
2. Baseline 0028 reduzido de 176 para ≤ ~118 (≈57 funções restantes × 2 roles + 4 helpers já limpos).
3. `tsgo` limpo, testes unitários/governança verdes, sem regressão em fluxos existentes.

## 10. Confirmação — nenhuma alteração produtiva neste recorte

- ❌ Nenhuma migração aplicada.
- ❌ Nenhum código de aplicação alterado.
- ❌ Nenhum grant/revoke emitido.
- ✅ Apenas leitura do catálogo + geração deste documento.

## 11. Resultado do `tsgo`

Sem alteração de código — `tsgo` permanece no estado verde do fim do SAAS-02.

## 12. Indicadores finais (baseline atual do remix, pós-SAAS-02)

- **0028 (Public Can Execute SECURITY DEFINER Function):** **176** — inalterado neste recorte. Herança do remix. SAAS-02 não contribuiu.
- **0025:** sem alteração — SAAS-02 não introduziu.
- **0029:** sem alteração — SAAS-02 não introduziu.

---

**Decisão registrada:** Prosseguir com SAAS-02-S2 (hardening médio, 29 funções) como **bloqueio** para SAAS-03. SAAS-02-S3 e SAAS-02-S4 ficam em fila com prazo para fechar antes de SAAS-06.
