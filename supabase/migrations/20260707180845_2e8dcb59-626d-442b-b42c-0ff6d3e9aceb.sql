
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_pertence_instituicao(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_tem_papel_local(uuid, uuid, public.saas_papel_local) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_is_admin_instituicao(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_tg_touch_updated_at() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_pertence_instituicao(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_tem_papel_local(uuid, uuid, public.saas_papel_local) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_admin_instituicao(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_tg_touch_updated_at() TO service_role;
