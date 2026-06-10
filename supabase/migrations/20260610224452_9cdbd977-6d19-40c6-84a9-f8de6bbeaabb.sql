ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS senha_temporaria boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.checkin_tentativas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip text,
  token text,
  sucesso boolean NOT NULL DEFAULT false,
  motivo text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.checkin_tentativas TO service_role;
GRANT SELECT ON public.checkin_tentativas TO authenticated;

ALTER TABLE public.checkin_tentativas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read checkin_tentativas"
ON public.checkin_tentativas
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_checkin_tentativas_ip_created
ON public.checkin_tentativas (ip, created_at DESC);