
-- SAAS-02-S2: Hardening médio das funções SECURITY DEFINER herdadas.
-- Padrão: REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role.
-- Funções de trigger (fn_block_admin_grant, fn_protect_last_master_roles, fn_protect_master_status)
-- não precisam de GRANT — o trigger executa como owner. Apenas revogamos PUBLIC/anon.

-- 4.1 Autorização / roles / promoção admin
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_active_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_admin(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_active_master(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_master(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.count_active_masters() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_active_masters() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.count_apt_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_apt_admins() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_eh_gestor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_eh_gestor(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_eh_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_eh_staff(uuid) TO authenticated, service_role;

-- Trigger functions: revoke only.
REVOKE EXECUTE ON FUNCTION public.fn_block_admin_grant() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_protect_last_master_roles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_protect_master_status() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.solicitar_promocao_admin(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_promocao_admin(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.decidir_promocao_admin(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_promocao_admin(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_conceder_acesso_base() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conceder_acesso_base() TO authenticated, service_role;

-- 4.2 Acesso operacional / coordenação
REVOKE EXECUTE ON FUNCTION public.fn_conceder_acesso_operacional(uuid, app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conceder_acesso_operacional(uuid, app_role, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_revogar_acesso_operacional(uuid, app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_revogar_acesso_operacional(uuid, app_role, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_coordena_tratamento(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_coordena_tratamento(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_designar_coordenador(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_designar_coordenador(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_remover_coordenador(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_remover_coordenador(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_listar_coordenacao_tratamentos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_listar_coordenacao_tratamentos() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_tratamentos_do_coordenador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tratamentos_do_coordenador(uuid) TO authenticated, service_role;

-- 4.6 Notificações / fila / dispatch (escritas)
REVOKE EXECUTE ON FUNCTION public.fn_enqueue_notificacao(notif_evento, uuid, text, jsonb, timestamp with time zone, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_notificacao(notif_evento, uuid, text, jsonb, timestamp with time zone, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_encerrar_item_fila_erro_cadastro(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_encerrar_item_fila_erro_cadastro(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_encerrar_item_fila_obsoleto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_encerrar_item_fila_obsoleto(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_enfileirar_mensagem_manual(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_enfileirar_mensagem_manual(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_sanear_fila_notificacoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sanear_fila_notificacoes() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.marcar_envio_concluido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_envio_concluido(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.preparar_envio_institucional(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparar_envio_institucional(uuid, text, integer) TO authenticated, service_role;

-- 4.11 Parâmetros / auditoria (escritas)
REVOKE EXECUTE ON FUNCTION public.fn_listar_parametros_operacionais() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_listar_parametros_operacionais() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_atualizar_parametro_operacional(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_parametro_operacional(text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.registrar_auditoria_reconciliacao(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria_reconciliacao(uuid, jsonb) TO authenticated, service_role;

-- 4.5 Piloto agenda / homologação
REVOKE EXECUTE ON FUNCTION public.pts_persistir_plano(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_persistir_plano(uuid, jsonb, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.pts_homologacao_auditar(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_homologacao_auditar(uuid, text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.pts_rollback_piloto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pts_rollback_piloto(uuid) TO authenticated, service_role;
