
CREATE OR REPLACE FUNCTION public.fn_sync_admin_instituicao_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_ativos int;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Autoriza a concessão/remoção controlada de 'admin' apenas dentro desta função
  PERFORM set_config('app.allow_admin_grant', 'on', true);

  SELECT count(*) INTO v_ativos
    FROM public.instituicao_usuarios
   WHERE user_id = v_user_id
     AND papel_local = 'admin_instituicao'
     AND status = 'ativo';

  IF v_ativos > 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = v_user_id AND role = 'administrador_master'
    ) THEN
      DELETE FROM public.user_roles
       WHERE user_id = v_user_id AND role = 'admin';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Backfill controlado
DO $$
BEGIN
  PERFORM set_config('app.allow_admin_grant', 'on', true);
  INSERT INTO public.user_roles (user_id, role)
  SELECT DISTINCT iu.user_id, 'admin'::app_role
    FROM public.instituicao_usuarios iu
   WHERE iu.papel_local = 'admin_instituicao'
     AND iu.status = 'ativo'
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
