# P1 — Auditoria de superfícies privilegiadas

> Inventário orientado a risco das superfícies privilegiadas (edge functions, storage, `0029`).
> Princípio: **usar `service_role` internamente não é vulnerabilidade**; o risco é *guarda inadequado*,
> *bypass de autenticação/autorização* ou *operação privilegiada exposta a quem não deveria*.
> Estado: `0028`=0 · `0025`=0 mantidos. `0029` documentado e subpriorizado abaixo.

## 1. Edge functions

| Nome | Tipo | service_role? | Risco de bypass? | Guarda | Veredito |
|---|---|---|---|---|---|
| `checkin-publico` | pública | sim | médio | token sessão + rate limit | OK |
| `request-signup` | pública | sim | médio | validação + anti-abuso | OK |
| `whatsapp-inbound` | webhook S2S | sim | alto se assinatura fraca | validação de segredo/assinatura | OK (revisado em BUG-03) |
| `create-user` / `manage-user` / `manage-signup` | administrativa | sim | alto | role admin/master | OK |
| `mfa-manager` | autenticada sensível | sim | alto | escopo `auth.uid()` / reset master | OK |
| `reset-password` | autenticada/admin | sim | médio | guarda + sem log de senha | OK |
| `assistente-entrevista` | autenticada | sim | alto | role entrevistador/admin | OK |
| `conteudo-imagem-ia` | autenticada | sim | baixo | role staff | OK |
| `whatsapp-responder` | autenticada/cron | sim | médio | role + guard | OK |
| `insights-dashboard` | autenticada | não | baixo | role leitura | OK |
| `alertas-operacionais` / `central-fila-alerta` / `comunicacao-dispatch` / `notificacoes-dispatch` / `ia-site-ingestao` | cron/staff | sim | médio | `guardCronOrStaff` | OK |
| `_shared/auth.ts` · `_shared/cors.ts` | fronteira | n/a | base | guard + allowlist CORS | OK |

Sem novos achados de bypass nesta frente. CORS e `guardCronOrStaff` permanecem como fronteira central.

## 2. Storage / buckets

| Bucket | Conteúdo | Público? | Listagem? | Veredito |
|---|---|---|---|---|
| `avatars` | fotos de perfil / imagens institucionais | público (exibição) | não (removida no S1) | OK — público só p/ exibição; enumeração fechada |
| `ia-biblioteca` | base de conhecimento IA | privado | só staff | OK — SELECT/UPDATE staff (S1 ia_biblioteca_update_missing) |
| `termos-voluntarios` | termo de adesão (PII) | privado | restrito | OK — 100% privado, sem URL pública |

Documento sensível (`termos-voluntarios`) confirmado privado, sem URL pública nem enumeração.

## 3. Residual `0029` — subpriorização das funções

### A1 — dado sensível / privilégio alto
`lista_usuarios_email`, `staff_names`, `fn_entrevistas_operacional`, `agendar_entrevista_fraterna`,
`decidir_promocao_admin`, `solicitar_promocao_admin`, `dashboard_admin`, `painel_conversas`,
`painel_whatsapp`, `painel_whatsapp_v2`, `metricas_ia_whatsapp`, `preparar_envio_institucional`,
`gerenciar_voluntario`, `gerenciar_termo_voluntario`, `fn_buscar_pessoa_para_voluntario`,
`fn_voluntario_pendencias_cadastro` ✅(guard add P1), `relatorio_carga_tarefeiro`,
`relatorio_faltas_periodo`, `relatorio_frequencia_presenca`, `relatorio_tratamentos_concluidos`.
**Todas com checagem interna de papel.** `fn_excecao_alvos` (PII) → **revogada de authenticated** (P1).

### A2 — efeito de escrita / governança
`registrar_presenca` (S1), `pts_registrar_presenca` ✅(guard+operador real P1),
`pts_registrar_ausencia` ✅(guard+operador real P1), `pts_persistir_plano`, `pts_converter_assistido`,
`pts_homologacao_auditar`, `pts_rollback_piloto`, `fn_atualizar_parametro_operacional`,
`fn_conceder_acesso_operacional`, `fn_revogar_acesso_operacional`, `fn_designar_coordenador`,
`fn_remover_coordenador`, `fn_encerrar_item_fila_erro_cadastro`, `fn_enfileirar_mensagem_manual`,
`fn_registrar_aviso_ausencia`, `fn_tratar_aviso_ausencia`, `migrar_assistido_legado_tratamento`,
`registrar_auditoria_reconciliacao`,
`fn_processar_excecao_notificacoes` ✅(guard gestor P1),
`fn_reconciliar_excecoes_notificacoes` ✅(guard gestor P1),
`fn_sanear_fila_notificacoes` ✅(guard gestor P1),
`fn_monitor_excecao_notificacoes` ✅(guard gestor P1).

### B — helpers de RLS / booleanos de suporte (precisam ser executáveis por authenticated)
`has_role`, `is_active_admin`, `is_active_master`, `fn_eh_staff` (novo), `fn_eh_gestor` (novo),
`fn_coordena_tratamento`, `assistido_belongs_to_coordinator`,
`entrevista_assistido_belongs_to_coordinator`, `fn_eh_proxima_sessao`, `fn_proxima_sessao_vinculo`,
`fn_fila_motivo_inelegivel`, `fn_excecao_alvos` (agora interno), `count_active_masters`,
`count_apt_admins`, `fn_lembrete_antecedencia_horas`, `fn_confirmacao_agendamento_ativa`,
`fn_confirmacao_entrevista_ativa`, `fn_listar_parametros_operacionais`,
`fn_listar_coordenacao_tratamentos`, `fn_tratamentos_do_coordenador`.

### C — aceitáveis por arquitetura (escopo no próprio `auth.uid()` / leitura não sensível)
`fn_avisos_ausencia_pendentes`, `fn_observabilidade_operacional` (guard interno),
`fn_fila_diagnostico_pendentes`, `fn_proxima_sessao_vinculo`, `contar_publico_elegivel`,
`sou_comunicador_elegivel`, `fn_excecao_alvos`(N/A), demais leitores escopados.

## 4. Achados e ações (Lote A)

- **AVM-P1-001 (PII):** `fn_excecao_alvos` retornava telefone/nome sem checagem de papel e era
  executável por qualquer autenticado. Helper 100% interno (sem chamada do frontend).
  **Ação:** `REVOKE EXECUTE` de `authenticated`/`anon`/`PUBLIC`.
- **AVM-P1-002 (write/governança):** pipeline de exceção (`fn_processar_…`, `fn_reconciliar_…`,
  `fn_sanear_…`, `fn_monitor_…`) sem checagem de papel. **Ação:** exigir `fn_eh_gestor(auth.uid())`
  quando há usuário; execução interna (cron/service_role, `auth.uid()` nulo) permitida.
- **AVM-P1-003 (write):** `pts_registrar_presenca` / `pts_registrar_ausencia` aceitavam
  `registrado_por` do cliente e não exigiam papel. **Ação:** exigir `fn_eh_staff(auth.uid())` e
  gravar o operador real (`auth.uid()`), ignorando o parâmetro do cliente (consistente com S1
  `registrar_presenca`).
- **AVM-P1-004:** `fn_voluntario_pendencias_cadastro` lia `voluntarios` sem papel.
  **Ação:** exigir `fn_eh_staff(auth.uid())`.

## 5. Critério de pronto da P1 — status

1. Item privilegiado sem decisão → **0** (tabelas acima).
2. Superfície pública sem justificativa → **0**.
3. Edge functions: `service_role` ≠ bypass; administrativas com role; públicas/webhook com token/assinatura/rate limit → **OK**.
4. Storage: nenhum bucket público desnecessário; documento sensível privado → **OK**.
5. Residual `0029`: classificado (A1/A2/B/C), justificado, documentado; A1/A2 com guarda → **OK**.
6. Warnings aceitos registrados como arquitetura intencional (baldes B/C) → **este documento + `docs/SECURITY.md`**.
7. `0028`=0 / `0025`=0 mantidos → **OK**.
8. Suíte de governança verde (130/130) → **OK**.

## 6. Lote C — Reconciliação final do `0029` (2026-06-30) — P1 ENCERRADA

**`0029`: 66 → 56.** Distribuição final: **A=44 · B=10 · C=10 · Pilotos=2**.
Detalhamento completo (tabela das 10 revogadas, guardas do Balde A, helpers do Balde B,
contrato do pipeline de exceção) em `docs/SECURITY.md` §10.

- **Saíram de `authenticated` (Balde C, 10):** `count_active_masters`, `count_apt_admins`,
  `fn_sanear_fila_notificacoes`, `fn_fila_motivo_inelegivel`,
  `fn_reconciliar_excecoes_notificacoes`, `fn_confirmacao_agendamento_ativa`,
  `fn_confirmacao_entrevista_ativa`, `fn_lembrete_antecedencia_horas`,
  `fn_proxima_sessao_vinculo`, `fn_eh_proxima_sessao`.
- **Permaneceram por arquitetura intencional:** Balde A (44 RPCs de negócio com guarda
  interna de papel) + Balde B (10 helpers de RLS executáveis por `authenticated`) +
  Pilotos (2, com débito de expiração).
- **Contrato preservado:** `fn_processar_excecao_notificacoes` /
  `fn_monitor_excecao_notificacoes` → autenticado sem papel negado; interno/service_role
  permitido.
- **Verificação:** `lote-c-residual-0029.dbtest.ts` (17) + governança 130/130 + `0029`=56
  confirmado em consulta direta. `0028`=0 / `0025`=0 mantidos.

> Critério de pronto da P1 atendido: 100% das funções privilegiadas com decisão registrada;
> nenhuma superfície pública sem justificativa; warnings aceitos documentados como arquitetura
> intencional. **P1 encerrada formalmente.**
