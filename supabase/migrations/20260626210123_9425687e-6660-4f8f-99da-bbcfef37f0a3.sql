
REVOKE ALL ON FUNCTION public.fn_buscar_pessoa_para_voluntario(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_voluntario_pendencias_cadastro(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_voluntario_cadastro_completo(text,text,text,text,date,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_buscar_pessoa_para_voluntario(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_voluntario_pendencias_cadastro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_voluntario_cadastro_completo(text,text,text,text,date,text,text,text,text,text,text) TO authenticated;
