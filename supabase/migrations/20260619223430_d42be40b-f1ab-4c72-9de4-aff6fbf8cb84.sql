REVOKE EXECUTE ON FUNCTION public.metricas_ia_whatsapp(timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.metricas_ia_whatsapp(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.metricas_ia_whatsapp(timestamptz, timestamptz) TO authenticated;