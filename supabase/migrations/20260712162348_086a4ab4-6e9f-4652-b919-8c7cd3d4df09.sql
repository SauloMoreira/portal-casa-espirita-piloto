
-- Helper: check if an assistido belongs to a tenant the current user is a member of
CREATE OR REPLACE FUNCTION public.fn_assistido_no_meu_tenant(_assistido_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assistidos a
    WHERE a.id = _assistido_id
      AND public.user_pertence_instituicao(auth.uid(), a.instituicao_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_assistido_tratamento_no_meu_tenant(_at_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.assistido_tratamentos at
      JOIN public.assistidos a ON a.id = at.assistido_id
    WHERE at.id = _at_id
      AND public.user_pertence_instituicao(auth.uid(), a.instituicao_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_sugestao_ia_no_meu_tenant(_sug_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.ia_sugestoes s
      JOIN public.assistidos a ON a.id = s.assistido_id
    WHERE s.id = _sug_id
      AND public.user_pertence_instituicao(auth.uid(), a.instituicao_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_checkin_publico_no_meu_tenant(_sessao_id uuid, _assistido_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE
      WHEN _sessao_id IS NOT NULL THEN EXISTS (
        SELECT 1 FROM public.sessoes_publicas s
        WHERE s.id = _sessao_id
          AND public.user_pertence_instituicao(auth.uid(), s.instituicao_id)
      )
      WHEN _assistido_id IS NOT NULL THEN public.fn_assistido_no_meu_tenant(_assistido_id)
      ELSE false
    END;
$$;

-- =========================================================
-- agenda_tratamentos_assistido
-- =========================================================
DROP POLICY IF EXISTS "Admins manage agenda_tratamentos" ON public.agenda_tratamentos_assistido;
CREATE POLICY "Admins manage agenda_tratamentos" ON public.agenda_tratamentos_assistido
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Entrevistadores manage agenda_tratamentos" ON public.agenda_tratamentos_assistido;
CREATE POLICY "Entrevistadores manage agenda_tratamentos" ON public.agenda_tratamentos_assistido
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Tarefeiros read agenda_tratamentos" ON public.agenda_tratamentos_assistido;
CREATE POLICY "Tarefeiros read agenda_tratamentos" ON public.agenda_tratamentos_assistido
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Tarefeiros update agenda_tratamentos" ON public.agenda_tratamentos_assistido;
CREATE POLICY "Tarefeiros update agenda_tratamentos" ON public.agenda_tratamentos_assistido
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

-- =========================================================
-- assistido_tratamentos
-- =========================================================
DROP POLICY IF EXISTS "Admins manage assistido_tratamentos" ON public.assistido_tratamentos;
CREATE POLICY "Admins manage assistido_tratamentos" ON public.assistido_tratamentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Entrevistadores manage assistido_tratamentos" ON public.assistido_tratamentos;
CREATE POLICY "Entrevistadores manage assistido_tratamentos" ON public.assistido_tratamentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Tarefeiros read assistido_tratamentos" ON public.assistido_tratamentos;
CREATE POLICY "Tarefeiros read assistido_tratamentos" ON public.assistido_tratamentos
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Tarefeiros update assistido_tratamentos" ON public.assistido_tratamentos;
CREATE POLICY "Tarefeiros update assistido_tratamentos" ON public.assistido_tratamentos
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

-- =========================================================
-- checkins_publicos
-- =========================================================
DROP POLICY IF EXISTS "Admins manage checkins_publicos" ON public.checkins_publicos;
CREATE POLICY "Admins manage checkins_publicos" ON public.checkins_publicos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_checkin_publico_no_meu_tenant(sessao_id, assistido_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_checkin_publico_no_meu_tenant(sessao_id, assistido_id));

DROP POLICY IF EXISTS "Tarefeiros manage checkins_publicos" ON public.checkins_publicos;
CREATE POLICY "Tarefeiros manage checkins_publicos" ON public.checkins_publicos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_checkin_publico_no_meu_tenant(sessao_id, assistido_id))
  WITH CHECK (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_checkin_publico_no_meu_tenant(sessao_id, assistido_id));

-- =========================================================
-- entrevistas_fraternas
-- =========================================================
DROP POLICY IF EXISTS "Admins manage entrevistas" ON public.entrevistas_fraternas;
CREATE POLICY "Admins manage entrevistas" ON public.entrevistas_fraternas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Entrevistadores manage own entrevistas" ON public.entrevistas_fraternas;
CREATE POLICY "Entrevistadores manage own entrevistas" ON public.entrevistas_fraternas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

-- =========================================================
-- ia_sugestoes
-- =========================================================
DROP POLICY IF EXISTS "Admins manage ia_sugestoes" ON public.ia_sugestoes;
CREATE POLICY "Admins manage ia_sugestoes" ON public.ia_sugestoes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Entrevistadores insert ia_sugestoes" ON public.ia_sugestoes;
CREATE POLICY "Entrevistadores insert ia_sugestoes" ON public.ia_sugestoes
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Entrevistadores read ia_sugestoes" ON public.ia_sugestoes;
CREATE POLICY "Entrevistadores read ia_sugestoes" ON public.ia_sugestoes
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

-- =========================================================
-- ia_feedback (tenant via sugestao_ia_id)
-- =========================================================
DROP POLICY IF EXISTS "Admins manage ia_feedback" ON public.ia_feedback;
CREATE POLICY "Admins manage ia_feedback" ON public.ia_feedback
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_sugestao_ia_no_meu_tenant(sugestao_ia_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_sugestao_ia_no_meu_tenant(sugestao_ia_id));

DROP POLICY IF EXISTS "Entrevistadores insert ia_feedback" ON public.ia_feedback;
CREATE POLICY "Entrevistadores insert ia_feedback" ON public.ia_feedback
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_sugestao_ia_no_meu_tenant(sugestao_ia_id));

DROP POLICY IF EXISTS "Entrevistadores read ia_feedback" ON public.ia_feedback;
CREATE POLICY "Entrevistadores read ia_feedback" ON public.ia_feedback
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_sugestao_ia_no_meu_tenant(sugestao_ia_id));

-- =========================================================
-- plano_tratamento_sessoes
-- =========================================================
DROP POLICY IF EXISTS "Admins manage plano_tratamento_sessoes" ON public.plano_tratamento_sessoes;
CREATE POLICY "Admins manage plano_tratamento_sessoes" ON public.plano_tratamento_sessoes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Entrevistadores manage plano_tratamento_sessoes" ON public.plano_tratamento_sessoes;
CREATE POLICY "Entrevistadores manage plano_tratamento_sessoes" ON public.plano_tratamento_sessoes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Tarefeiros read plano_tratamento_sessoes" ON public.plano_tratamento_sessoes;
CREATE POLICY "Tarefeiros read plano_tratamento_sessoes" ON public.plano_tratamento_sessoes
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Tarefeiros update plano_tratamento_sessoes" ON public.plano_tratamento_sessoes;
CREATE POLICY "Tarefeiros update plano_tratamento_sessoes" ON public.plano_tratamento_sessoes
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

-- =========================================================
-- presencas_palestras
-- =========================================================
DROP POLICY IF EXISTS "Admins manage presencas_palestras" ON public.presencas_palestras;
CREATE POLICY "Admins manage presencas_palestras" ON public.presencas_palestras
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Entrevistadores manage presencas_palestras" ON public.presencas_palestras;
CREATE POLICY "Entrevistadores manage presencas_palestras" ON public.presencas_palestras
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

-- =========================================================
-- orientacoes_assistido
-- =========================================================
DROP POLICY IF EXISTS "Admins manage orientacoes" ON public.orientacoes_assistido;
CREATE POLICY "Admins manage orientacoes" ON public.orientacoes_assistido
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

DROP POLICY IF EXISTS "Entrevistadores manage orientacoes" ON public.orientacoes_assistido;
CREATE POLICY "Entrevistadores manage orientacoes" ON public.orientacoes_assistido
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id))
  WITH CHECK (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_no_meu_tenant(assistido_id));

-- =========================================================
-- presencas_tratamentos (tenant via assistido_tratamento_id)
-- =========================================================
DROP POLICY IF EXISTS "Admins manage presencas_tratamentos" ON public.presencas_tratamentos;
CREATE POLICY "Admins manage presencas_tratamentos" ON public.presencas_tratamentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_tratamento_no_meu_tenant(assistido_tratamento_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.fn_assistido_tratamento_no_meu_tenant(assistido_tratamento_id));

DROP POLICY IF EXISTS "Entrevistadores read presencas" ON public.presencas_tratamentos;
CREATE POLICY "Entrevistadores read presencas" ON public.presencas_tratamentos
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'entrevistador'::app_role) AND public.fn_assistido_tratamento_no_meu_tenant(assistido_tratamento_id));

DROP POLICY IF EXISTS "Tarefeiros manage presencas" ON public.presencas_tratamentos;
CREATE POLICY "Tarefeiros manage presencas" ON public.presencas_tratamentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_tratamento_no_meu_tenant(assistido_tratamento_id))
  WITH CHECK (has_role(auth.uid(), 'tarefeiro'::app_role) AND public.fn_assistido_tratamento_no_meu_tenant(assistido_tratamento_id));
