REVOKE ALL ON FUNCTION public.fn_backfill_fix16_vinculos_voluntarios() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_definir_status_vinculo_instituicao(uuid, saas_vinculo_status) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_listar_vinculos_instituicao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_saas05_i_log_fallback(text, text, uuid, text, boolean, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_saas05_i_log_legacy_rpc(text, text, uuid, boolean, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_sync_admin_instituicao_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_vincular_usuario_instituicao(uuid, text, saas_papel_local, saas_vinculo_status) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_voluntarios_orfaos_do_tenant(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_definir_status_vinculo_instituicao(uuid, saas_vinculo_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_listar_vinculos_instituicao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_admin_instituicao_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_vincular_usuario_instituicao(uuid, text, saas_papel_local, saas_vinculo_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_voluntarios_orfaos_do_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_backfill_fix16_vinculos_voluntarios() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_saas05_i_log_fallback(text, text, uuid, text, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_saas05_i_log_legacy_rpc(text, text, uuid, boolean, jsonb) TO service_role;