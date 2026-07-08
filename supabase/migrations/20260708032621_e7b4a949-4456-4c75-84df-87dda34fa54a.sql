
-- SAAS-02-S3: Hardening baixo residual das funções SECURITY DEFINER herdadas.
-- Padrão: REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role.
-- Funções puramente de trigger não precisam de GRANT — o trigger executa como owner —
-- então apenas revogamos PUBLIC/anon nelas.
-- Sem alterar corpo, assinatura, retorno, search_path, RLS/policies, NOT NULL ou cutover.

-- ============================================================
-- Grupo A — RPCs consumidas por usuários autenticados / edges
-- REVOKE PUBLIC, anon + GRANT authenticated, service_role
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.agenda_validar_horario_holistico() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_validar_horario_holistico() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.agendar_entrevista_fraterna(uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_entrevista_fraterna(uuid, timestamptz, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.assistido_belongs_to_coordinator(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistido_belongs_to_coordinator(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.comunicadores_elegiveis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comunicadores_elegiveis() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.contar_publico_elegivel(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contar_publico_elegivel(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.dashboard_admin(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_admin(date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.entrevista_assistido_belongs_to_coordinator(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrevista_assistido_belongs_to_coordinator(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fila_humana_pendente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fila_humana_pendente() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_avisos_ausencia_pendentes(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_avisos_ausencia_pendentes(boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_buscar_pessoa_para_voluntario(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_buscar_pessoa_para_voluntario(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_confirmacao_agendamento_ativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_confirmacao_agendamento_ativa() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_confirmacao_entrevista_ativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_confirmacao_entrevista_ativa() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_eh_proxima_sessao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_eh_proxima_sessao(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_entrevistas_operacional(timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entrevistas_operacional(timestamptz, timestamptz, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_excecao_alvos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_excecao_alvos(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_fila_diagnostico_pendentes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fila_diagnostico_pendentes() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_fila_motivo_inelegivel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fila_motivo_inelegivel(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_lembrete_antecedencia_horas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lembrete_antecedencia_horas() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_monitor_excecao_notificacoes(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_monitor_excecao_notificacoes(timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_observabilidade_operacional(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_observabilidade_operacional(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_processar_excecao_notificacoes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_processar_excecao_notificacoes(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_promover_proxima_sessao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_promover_proxima_sessao(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_proxima_sessao_vinculo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_proxima_sessao_vinculo(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliar_excecoes_notificacoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reconciliar_excecoes_notificacoes() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_registrar_aviso_ausencia(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_aviso_ausencia(text, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_tratar_aviso_ausencia(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tratar_aviso_ausencia(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_voluntario_pendencias_cadastro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_voluntario_pendencias_cadastro(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.gerenciar_termo_voluntario(text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_termo_voluntario(text, uuid, text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.gerenciar_voluntario(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_voluntario(text, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.lista_usuarios_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lista_usuarios_email() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.metricas_ia_whatsapp(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_ia_whatsapp(timestamptz, timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.migrar_assistido_legado_tratamento(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrar_assistido_legado_tratamento(uuid, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.painel_conversas(date, date, text, boolean, boolean, boolean, uuid, text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_conversas(date, date, text, boolean, boolean, boolean, uuid, text, boolean, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.painel_whatsapp(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_whatsapp(date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.painel_whatsapp_v2(date, date, text, text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_whatsapp_v2(date, date, text, text, uuid, text, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.pts_converter_assistido(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_converter_assistido(uuid, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.pts_registrar_ausencia(uuid, date, uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_registrar_ausencia(uuid, date, uuid, date, time) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.pts_registrar_presenca(uuid, date, uuid, integer, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_registrar_presenca(uuid, date, uuid, integer, date, time) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.registrar_presenca(uuid, date, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_presenca(uuid, date, text, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.relatorio_carga_tarefeiro(date, date, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_carga_tarefeiro(date, date, uuid, uuid, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.relatorio_faltas_periodo(date, date, uuid, uuid, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_faltas_periodo(date, date, uuid, uuid, uuid, uuid, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.relatorio_frequencia_presenca(date, date, uuid, uuid, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_frequencia_presenca(date, date, uuid, uuid, uuid, uuid, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.relatorio_tratamentos_concluidos(date, date, uuid, text, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_tratamentos_concluidos(date, date, uuid, text, uuid, uuid, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.sou_comunicador_elegivel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sou_comunicador_elegivel() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.staff_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_names(uuid[]) TO authenticated, service_role;

-- ============================================================
-- Grupo B — Trigger functions (invocadas como owner via triggers;
-- não precisam de GRANT explícito, apenas revogam PUBLIC/anon).
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.fn_audit_trigger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_stamp_actor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_assistido_cadastro_minimo() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_notif_entrevista() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_notif_presenca() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_notif_sessao() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.liberar_proximo_tratamento() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_sessao_total_presentes() FROM PUBLIC, anon;
