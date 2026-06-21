-- 1) Remove unused table from Realtime publication.
-- 'agenda_tratamentos_assistido' is published to Realtime but no client subscribes
-- to it. Removing it eliminates the broadcast vector entirely (defense in depth on
-- top of the existing row-level security on the table).
ALTER PUBLICATION supabase_realtime DROP TABLE public.agenda_tratamentos_assistido;

-- 2) Harden the cron secrets table with explicit RESTRICTIVE deny policies.
-- The table already has no grants to anon/authenticated (only service-side roles can
-- reach it) and RLS is enabled with no permissive policies, so it is inaccessible via
-- the Data API. These RESTRICTIVE policies make the deny explicit and guarantee that
-- even if a permissive policy is ever added by mistake, app users still cannot read or
-- write secret values.
CREATE POLICY "Deny all access to cron secrets (anon)"
  ON public.app_cron_secrets
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny all access to cron secrets (authenticated)"
  ON public.app_cron_secrets
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);