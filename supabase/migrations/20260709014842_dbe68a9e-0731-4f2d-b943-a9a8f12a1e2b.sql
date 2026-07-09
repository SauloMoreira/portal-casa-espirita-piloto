
REVOKE ALL ON FUNCTION public.fn_is_admin_instituicao(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_is_admin_instituicao(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_platform_admin(uuid) TO authenticated, service_role;
