CREATE OR REPLACE FUNCTION public.fn_notif_ping()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $function$ SELECT 'ok'::text $function$;