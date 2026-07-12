
REVOKE ALL ON FUNCTION public.fn_assistido_no_meu_tenant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_assistido_tratamento_no_meu_tenant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_sugestao_ia_no_meu_tenant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_checkin_publico_no_meu_tenant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assistido_no_meu_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_assistido_tratamento_no_meu_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sugestao_ia_no_meu_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_checkin_publico_no_meu_tenant(uuid, uuid) TO authenticated;
