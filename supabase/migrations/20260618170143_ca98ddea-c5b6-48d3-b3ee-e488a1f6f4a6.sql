CREATE TABLE IF NOT EXISTS public.app_cron_secrets (
  name text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_cron_secrets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.app_cron_secrets TO service_role;
REVOKE ALL ON public.app_cron_secrets FROM anon, authenticated;

INSERT INTO public.app_cron_secrets (name, secret) VALUES
  ('default', '195177b36750830e38f5764a0e550f5b9e0730be2010129fe9a93ede6da60972'),
  ('whatsapp_webhook', 'd2b6f0a4c1e94f7a8b3d5e6f9012a3b4c5d6e7f8091a2b3c4d5e6f70819a2b3c4')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  j RECORD;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE command LIKE '%alertas-operacionais%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'alertas-operacionais-daily',
  '0 10 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://sstxquugeffchpwdyahe.supabase.co/functions/v1/alertas-operacionais',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "195177b36750830e38f5764a0e550f5b9e0730be2010129fe9a93ede6da60972"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $job$
);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.sessoes_publicas;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS "Authenticated can receive realtime" ON realtime.messages';
  EXECUTE $pol$
    CREATE POLICY "Authenticated can receive realtime"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (true)
  $pol$;

  EXECUTE 'DROP POLICY IF EXISTS "Authenticated can send realtime" ON realtime.messages';
  EXECUTE $pol$
    CREATE POLICY "Authenticated can send realtime"
    ON realtime.messages
    FOR INSERT
    TO authenticated
    WITH CHECK (true)
  $pol$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping realtime.messages RLS: %', SQLERRM;
END $$;