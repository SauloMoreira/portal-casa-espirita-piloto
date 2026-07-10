
REVOKE ALL ON FUNCTION public.fn_chamado_assumir(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chamado_solicitar_documento(uuid,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chamado_marcar_resolvido(uuid,text,public.chamado_resolucao_tipo,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chamado_fechar_cliente(uuid,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chamado_fechar_administrativo(uuid,text,public.chamado_fechamento_categoria,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chamado_cancelar(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chamado_reabrir(uuid,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_chamado_assumir(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chamado_solicitar_documento(uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chamado_marcar_resolvido(uuid,text,public.chamado_resolucao_tipo,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chamado_fechar_cliente(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chamado_fechar_administrativo(uuid,text,public.chamado_fechamento_categoria,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chamado_cancelar(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chamado_reabrir(uuid,text) TO authenticated;
