-- Fix 1: pin search_path on trigger function
ALTER FUNCTION public.tg_chamados_suporte_updated_at() SET search_path = public;

-- Fix 2: tighten storage.objects SELECT policy for suporte-anexos bucket
-- to enforce the same ownership/institution checks used by chamado_anexos_select.
DROP POLICY IF EXISTS suporte_anexos_select ON storage.objects;

CREATE POLICY suporte_anexos_select ON storage.objects
FOR SELECT
USING (
  bucket_id = 'suporte-anexos'
  AND EXISTS (
    SELECT 1
      FROM public.chamado_anexos a
      JOIN public.chamados_suporte c
        ON c.id = a.chamado_id
       AND c.instituicao_id = a.instituicao_id
     WHERE a.storage_path = storage.objects.name
       AND (
         public.is_platform_admin(auth.uid())
         OR public.fn_is_admin_instituicao(auth.uid(), c.instituicao_id)
         OR c.criado_por_user_id = auth.uid()
       )
  )
);