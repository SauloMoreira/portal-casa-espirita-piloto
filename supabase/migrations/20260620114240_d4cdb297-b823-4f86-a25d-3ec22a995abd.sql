CREATE OR REPLACE FUNCTION public.sou_comunicador_elegivel()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH meu_tel AS (
    SELECT public.fn_normalize_phone(p.celular) AS tel
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND public.fn_normalize_phone(p.celular) IS NOT NULL
  ),
  comunicadores AS (
    SELECT public.fn_normalize_phone(v.celular) AS tel
    FROM public.voluntarios v
    JOIN public.voluntario_funcoes vf ON vf.voluntario_id = v.id
    JOIN public.funcoes_voluntariado f ON f.id = vf.funcao_id
    WHERE v.status = 'ativo'
      AND lower(trim(f.nome_funcao)) = 'comunicador'
      AND public.fn_normalize_phone(v.celular) IS NOT NULL
  ),
  tel_unico_vol AS (
    SELECT tel FROM comunicadores GROUP BY tel HAVING COUNT(*) = 1
  ),
  tel_unico_perfil AS (
    SELECT public.fn_normalize_phone(celular) AS tel
    FROM public.profiles
    WHERE public.fn_normalize_phone(celular) IS NOT NULL
    GROUP BY public.fn_normalize_phone(celular)
    HAVING COUNT(*) = 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM meu_tel m
    JOIN tel_unico_vol uv ON uv.tel = m.tel
    JOIN tel_unico_perfil up ON up.tel = m.tel
  );
$$;

GRANT EXECUTE ON FUNCTION public.sou_comunicador_elegivel() TO authenticated;