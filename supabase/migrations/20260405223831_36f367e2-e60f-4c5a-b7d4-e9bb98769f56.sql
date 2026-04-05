
-- Create security definer function to check if assistido belongs to coordinator's treatments
CREATE OR REPLACE FUNCTION public.assistido_belongs_to_coordinator(_assistido_id uuid, _coordinator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assistido_tratamentos at
    JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
    WHERE at.assistido_id = _assistido_id
      AND tt.coordenador_responsavel_id = _coordinator_id
  )
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Coordenador reads assistidos of own tratamentos" ON public.assistidos;

-- Recreate using the security definer function
CREATE POLICY "Coordenador reads assistidos of own tratamentos"
ON public.assistidos
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND assistido_belongs_to_coordinator(id, auth.uid())
);

-- Also fix the entrevistas policy which has the same issue
DROP POLICY IF EXISTS "Coordenador reads entrevistas" ON public.entrevistas_fraternas;

CREATE OR REPLACE FUNCTION public.entrevista_assistido_belongs_to_coordinator(_assistido_id uuid, _coordinator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assistido_tratamentos at
    JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
    WHERE at.assistido_id = _assistido_id
      AND tt.coordenador_responsavel_id = _coordinator_id
  )
$$;

CREATE POLICY "Coordenador reads entrevistas"
ON public.entrevistas_fraternas
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND entrevista_assistido_belongs_to_coordinator(assistido_id, auth.uid())
);
