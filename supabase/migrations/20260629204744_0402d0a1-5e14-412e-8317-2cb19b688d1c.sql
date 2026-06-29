-- S1 / Lote 3: consolidação do residual 0029 (authenticated can execute SECURITY DEFINER)
-- Estratégia: SECURITY DEFINER é a fronteira de autorização. Onde a função é
-- executável por authenticated e retorna dado sensível, exigimos checagem interna
-- de papel. Onde a função é 100% interna, removemos authenticated. Funções de
-- gatilho não precisam de EXECUTE de usuário.

-- 1) lista_usuarios_email: só admin/master (usada na tela Usuários).
CREATE OR REPLACE FUNCTION public.lista_usuarios_email()
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'administrador_master')) THEN
    RAISE EXCEPTION 'nao autorizado';
  END IF;
  RETURN QUERY SELECT u.id AS user_id, u.email::text FROM auth.users u;
END;
$function$;

-- 2) staff_names: exigir papel de equipe (bloqueia assistido de obter diretório de nomes).
CREATE OR REPLACE FUNCTION public.staff_names(_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(user_id uuid, nome_completo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'administrador_master')
          OR public.has_role(auth.uid(), 'entrevistador')
          OR public.has_role(auth.uid(), 'coordenador_de_tratamento')
          OR public.has_role(auth.uid(), 'tarefeiro')) THEN
    RAISE EXCEPTION 'nao autorizado';
  END IF;
  RETURN QUERY
    SELECT p.user_id, p.nome_completo
    FROM public.profiles p
    WHERE _ids IS NULL OR p.user_id = ANY(_ids);
END;
$function$;

-- 3) Funções 100% internas (chamadas só por edge function via service_role):
--    remover authenticated/PUBLIC. service_role mantém EXECUTE.
REVOKE EXECUTE ON FUNCTION public.comunicadores_elegiveis() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fila_humana_pendente() FROM PUBLIC, anon, authenticated;

-- 4) Funções de gatilho: revogar EXECUTE de authenticated/anon/PUBLIC.
--    Triggers disparam como owner; não precisam de EXECUTE de usuário.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', r.sig);
  END LOOP;
END$$;