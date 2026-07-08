-- SAAS-05-I — Telemetria de uso legado (RPCs) e uso de fallbacks residuais.
-- Aditivo: cria tabelas de telemetria e helpers SECURITY DEFINER para logging
-- leve, sem alterar comportamento funcional.

CREATE TABLE IF NOT EXISTS public.saas05_i_legacy_rpc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rpc_nome text NOT NULL,
  origem text,
  tenant_recebido uuid,
  overload_tenant_aware_existe boolean NOT NULL DEFAULT true,
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
  marcador text NOT NULL DEFAULT 'saas05_i_legacy_rpc_usage',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas05_i_legacy_rpc_events_rpc
  ON public.saas05_i_legacy_rpc_events (rpc_nome, created_at DESC);

GRANT SELECT ON public.saas05_i_legacy_rpc_events TO authenticated;
GRANT ALL ON public.saas05_i_legacy_rpc_events TO service_role;

ALTER TABLE public.saas05_i_legacy_rpc_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saas05_i_legacy_rpc_events_admin_select"
  ON public.saas05_i_legacy_rpc_events;
CREATE POLICY "saas05_i_legacy_rpc_events_admin_select"
  ON public.saas05_i_legacy_rpc_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.saas05_i_fallback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fallback_nome text NOT NULL,
  motivo text NOT NULL,
  tenant_resolvido uuid,
  origem_tenant text,
  fail_closed boolean NOT NULL DEFAULT true,
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
  marcador text NOT NULL DEFAULT 'saas05_i_fallback_usage',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas05_i_fallback_events_fb
  ON public.saas05_i_fallback_events (fallback_nome, created_at DESC);

GRANT SELECT ON public.saas05_i_fallback_events TO authenticated;
GRANT ALL ON public.saas05_i_fallback_events TO service_role;

ALTER TABLE public.saas05_i_fallback_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saas05_i_fallback_events_admin_select"
  ON public.saas05_i_fallback_events;
CREATE POLICY "saas05_i_fallback_events_admin_select"
  ON public.saas05_i_fallback_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.fn_saas05_i_log_legacy_rpc(
  p_rpc text,
  p_origem text DEFAULT NULL,
  p_tenant_recebido uuid DEFAULT NULL,
  p_overload_tenant_aware_existe boolean DEFAULT true,
  p_contexto jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.saas05_i_legacy_rpc_events(
      rpc_nome, origem, tenant_recebido,
      overload_tenant_aware_existe, contexto
    ) VALUES (
      p_rpc, p_origem, p_tenant_recebido,
      COALESCE(p_overload_tenant_aware_existe, true),
      COALESCE(p_contexto, '{}'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_saas05_i_log_legacy_rpc(text, text, uuid, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_saas05_i_log_legacy_rpc(text, text, uuid, boolean, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_saas05_i_log_fallback(
  p_fallback text,
  p_motivo text,
  p_tenant_resolvido uuid DEFAULT NULL,
  p_origem_tenant text DEFAULT NULL,
  p_fail_closed boolean DEFAULT true,
  p_contexto jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.saas05_i_fallback_events(
      fallback_nome, motivo, tenant_resolvido, origem_tenant,
      fail_closed, contexto
    ) VALUES (
      p_fallback, p_motivo, p_tenant_resolvido, p_origem_tenant,
      COALESCE(p_fail_closed, true),
      COALESCE(p_contexto, '{}'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_saas05_i_log_fallback(text, text, uuid, text, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_saas05_i_log_fallback(text, text, uuid, text, boolean, jsonb) TO authenticated, service_role;