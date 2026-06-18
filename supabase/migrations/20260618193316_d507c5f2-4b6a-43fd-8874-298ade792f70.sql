-- 1) Authorship columns (uuid only, no FK to auth.users per project convention)
ALTER TABLE public.entrevistas_fraternas
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 2) Trigger function that stamps the acting user automatically.
--    Works inside SECURITY DEFINER RPCs too, since auth.uid() returns the caller.
CREATE OR REPLACE FUNCTION public.fn_stamp_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    -- Preserve original author; refresh the editor.
    NEW.created_by := OLD.created_by;
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Attach BEFORE the audit trigger so the audit JSON captures the actor.
DROP TRIGGER IF EXISTS trg_stamp_actor_entrevistas ON public.entrevistas_fraternas;
CREATE TRIGGER trg_stamp_actor_entrevistas
BEFORE INSERT OR UPDATE ON public.entrevistas_fraternas
FOR EACH ROW EXECUTE FUNCTION public.fn_stamp_actor();