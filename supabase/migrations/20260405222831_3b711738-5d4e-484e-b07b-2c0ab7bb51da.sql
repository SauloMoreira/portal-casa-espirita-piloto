
-- Coordenador can read assistidos linked to their treatments
CREATE POLICY "Coordenador reads assistidos of own tratamentos"
ON public.assistidos
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND id IN (
    SELECT at.assistido_id FROM assistido_tratamentos at
    JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
    WHERE tt.coordenador_responsavel_id = auth.uid()
  )
);

-- Coordenador can read assistido_tratamentos of their treatments
CREATE POLICY "Coordenador reads assistido_tratamentos"
ON public.assistido_tratamentos
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND tratamento_id IN (
    SELECT id FROM tipos_tratamento WHERE coordenador_responsavel_id = auth.uid()
  )
);

-- Coordenador can update assistido_tratamentos (for scheduling)
CREATE POLICY "Coordenador updates assistido_tratamentos"
ON public.assistido_tratamentos
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND tratamento_id IN (
    SELECT id FROM tipos_tratamento WHERE coordenador_responsavel_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND tratamento_id IN (
    SELECT id FROM tipos_tratamento WHERE coordenador_responsavel_id = auth.uid()
  )
);

-- Coordenador can read agenda of their treatments
CREATE POLICY "Coordenador reads agenda_tratamentos"
ON public.agenda_tratamentos_assistido
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND tratamento_id IN (
    SELECT id FROM tipos_tratamento WHERE coordenador_responsavel_id = auth.uid()
  )
);

-- Coordenador can insert agenda entries (for scheduling)
CREATE POLICY "Coordenador inserts agenda_tratamentos"
ON public.agenda_tratamentos_assistido
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND tratamento_id IN (
    SELECT id FROM tipos_tratamento WHERE coordenador_responsavel_id = auth.uid()
  )
);

-- Coordenador can read entrevistas_fraternas for ordering wait list
CREATE POLICY "Coordenador reads entrevistas"
ON public.entrevistas_fraternas
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
  AND assistido_id IN (
    SELECT at.assistido_id FROM assistido_tratamentos at
    JOIN tipos_tratamento tt ON tt.id = at.tratamento_id
    WHERE tt.coordenador_responsavel_id = auth.uid()
  )
);

-- Coordenador can read profiles (to see coordinator names etc)
CREATE POLICY "Coordenador reads profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
);
