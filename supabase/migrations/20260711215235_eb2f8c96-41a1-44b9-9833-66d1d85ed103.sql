
-- SAAS-06-C1-STAB08-RLS
-- Elimina recursão mútua (42P17) entre policies de public.assistidos e
-- public.assistido_tratamentos, encapsulando as travessias entre tabelas
-- protegidas em helpers SECURITY DEFINER mínimos (retorno booleano, sem PII).

-- ============================================================================
-- 1) Helper: coordenador pode ver o assistido?
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_coordenador_pode_ver_assistido(
  p_assistido_id uuid,
  p_instituicao_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_assistido_id IS NOT NULL
    AND p_instituicao_id IS NOT NULL
    -- (2) papel global de coordenador
    AND public.has_role(auth.uid(), 'coordenador_de_tratamento'::public.app_role)
    -- (3)(4) vínculo institucional ativo com papel compatível com coordenação
    AND EXISTS (
      SELECT 1 FROM public.instituicao_usuarios iu
       WHERE iu.user_id = auth.uid()
         AND iu.instituicao_id = p_instituicao_id
         AND iu.status = 'ativo'
         AND iu.papel_local IN ('coordenador'::public.saas_papel_local,
                                'admin_instituicao'::public.saas_papel_local)
    )
    -- (5) assistido pertence à instituição declarada
    AND EXISTS (
      SELECT 1 FROM public.assistidos a
       WHERE a.id = p_assistido_id
         AND a.instituicao_id = p_instituicao_id
    )
    -- (6)(7) existe vínculo do assistido em algum tratamento designado ao coordenador
    --        (join via assistidos para garantir mesma instituição — coordenacao_tratamento
    --         não possui instituicao_id, então a barreira tenant é o passo 5 + este join)
    AND EXISTS (
      SELECT 1
        FROM public.assistido_tratamentos at
        JOIN public.coordenacao_tratamento ct ON ct.tratamento_id = at.tratamento_id
        JOIN public.assistidos a2 ON a2.id = at.assistido_id
       WHERE at.assistido_id = p_assistido_id
         AND ct.coordenador_id = auth.uid()
         AND a2.instituicao_id = p_instituicao_id
    );
$$;

REVOKE ALL ON FUNCTION public.fn_coordenador_pode_ver_assistido(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_coordenador_pode_ver_assistido(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_coordenador_pode_ver_assistido(uuid, uuid) TO authenticated;

-- ============================================================================
-- 2) Helper: usuário é dono do assistido?
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_usuario_e_dono_do_assistido(
  p_assistido_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_assistido_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.assistidos a
       WHERE a.id = p_assistido_id
         AND a.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.fn_usuario_e_dono_do_assistido(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_usuario_e_dono_do_assistido(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_usuario_e_dono_do_assistido(uuid) TO authenticated;

-- ============================================================================
-- 3) Reescrita das duas policies recursivas (mesma transação/atomicidade)
-- ============================================================================

-- 3.a public.assistidos
DROP POLICY IF EXISTS "Coordenador reads assistidos of coordinated tratamentos"
  ON public.assistidos;

CREATE POLICY "Coordenador reads assistidos of coordinated tratamentos"
  ON public.assistidos
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador_de_tratamento'::public.app_role)
    AND public.fn_coordenador_pode_ver_assistido(id, instituicao_id)
  );

-- 3.b public.assistido_tratamentos
DROP POLICY IF EXISTS "Assistido views own tratamentos"
  ON public.assistido_tratamentos;

CREATE POLICY "Assistido views own tratamentos"
  ON public.assistido_tratamentos
  FOR SELECT
  TO authenticated
  USING (
    public.fn_usuario_e_dono_do_assistido(assistido_id)
  );

-- Fim STAB08-RLS
