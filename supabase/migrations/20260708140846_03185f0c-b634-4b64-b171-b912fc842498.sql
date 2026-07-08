
-- SAAS-06-A0 — Seed idempotente de platform_admin para o proprietário da plataforma.
-- Não altera dados reais nem o projeto FER original.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = 'saulocmoreira@gmail.com' LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.platform_admins (user_id, papel)
    VALUES (v_user_id, 'platform_owner'::saas_papel_global)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Auto-promoção quando o proprietário se cadastrar (via trigger em public.profiles,
-- que é criado logo após o signup). Idempotente e defensivo.
CREATE OR REPLACE FUNCTION public.fn_saas06a0_seed_platform_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_email text;
BEGIN
  BEGIN
    SELECT lower(email) INTO v_email FROM auth.users WHERE id = NEW.user_id LIMIT 1;
    IF v_email = 'saulocmoreira@gmail.com' THEN
      INSERT INTO public.platform_admins (user_id, papel)
      VALUES (NEW.user_id, 'platform_owner'::saas_papel_global)
      ON CONFLICT DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_saas06a0_seed_platform_owner ON public.profiles;
CREATE TRIGGER trg_saas06a0_seed_platform_owner
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_saas06a0_seed_platform_owner();

REVOKE ALL ON FUNCTION public.fn_saas06a0_seed_platform_owner() FROM PUBLIC;
