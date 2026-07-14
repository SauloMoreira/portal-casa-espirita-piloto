CREATE OR REPLACE FUNCTION public.fn_instituicoes_autocadastro_publico()
RETURNS TABLE (nome text, slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.nome, i.slug
  FROM public.instituicoes i
  WHERE i.autocadastro_habilitado = true
    AND i.status IN ('ativa', 'implantacao')
  ORDER BY i.nome ASC;
$$;

REVOKE ALL ON FUNCTION public.fn_instituicoes_autocadastro_publico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_instituicoes_autocadastro_publico() TO anon, authenticated;