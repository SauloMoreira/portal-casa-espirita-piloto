-- BUG-03: Bloquear exposição de conteúdo sensível da entrevista fraterna ao tarefeiro
-- Fonte de verdade no backend: tarefeiro deixa de ter SELECT direto na tabela
-- (que expunha observacoes/decisoes) e passa a ler apenas campos operacionais
-- por uma RPC SECURITY DEFINER que NUNCA retorna conteúdo sensível.

-- 1) RPC operacional: somente campos mínimos, jamais observacoes/decisoes.
CREATE OR REPLACE FUNCTION public.fn_entrevistas_operacional(
  _start timestamptz DEFAULT NULL,
  _end   timestamptz DEFAULT NULL,
  _id    uuid        DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  assistido_id uuid,
  entrevistador_id uuid,
  data timestamptz,
  tipo_entrevista text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.assistido_id, e.entrevistador_id, e.data, e.tipo_entrevista, e.status
  FROM public.entrevistas_fraternas e
  WHERE (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'entrevistador'::app_role)
    OR has_role(auth.uid(), 'tarefeiro'::app_role)
  )
  AND (_id IS NULL OR e.id = _id)
  AND (_start IS NULL OR e.data >= _start)
  AND (_end IS NULL OR e.data <= _end)
  ORDER BY e.data ASC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_entrevistas_operacional(timestamptz, timestamptz, uuid) TO authenticated;

-- 2) Remover o acesso direto do tarefeiro à tabela (que retornava todas as colunas,
-- incluindo observacoes e decisoes). A partir de agora o tarefeiro só enxerga
-- entrevistas pela RPC operacional, sem conteúdo sensível.
DROP POLICY IF EXISTS "Tarefeiros read entrevistas" ON public.entrevistas_fraternas;