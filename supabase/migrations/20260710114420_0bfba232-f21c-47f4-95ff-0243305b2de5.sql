
-- SAAS-06-C1-FIX12: permitir anexos .txt em chamados_anexos.
ALTER TABLE public.chamado_anexos DROP CONSTRAINT IF EXISTS chamado_anexos_mime;
ALTER TABLE public.chamado_anexos
  ADD CONSTRAINT chamado_anexos_mime CHECK (
    mime_type = ANY (ARRAY[
      'image/png',
      'image/jpeg',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ])
  );
