-- configuracoes_gerais
CREATE POLICY "admin_instituicao gerencia config do tenant"
  ON public.configuracoes_gerais
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
  );

CREATE POLICY "Membros leem config do proprio tenant"
  ON public.configuracoes_gerais
  FOR SELECT TO authenticated
  USING (public.user_pertence_instituicao(auth.uid(), instituicao_id));

-- regras_operacionais
CREATE POLICY "admin_instituicao gerencia regras do tenant"
  ON public.regras_operacionais
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
  );

CREATE POLICY "Membros leem regras nao sensiveis do proprio tenant"
  ON public.regras_operacionais
  FOR SELECT TO authenticated
  USING (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (
      COALESCE(sensivel, false) = false
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'coordenador_de_tratamento'::app_role)
    )
  );

-- excecoes_operacionais
CREATE POLICY "Staff do tenant leem excecoes operacionais"
  ON public.excecoes_operacionais
  FOR SELECT TO authenticated
  USING (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (
      has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento')
      OR has_role(auth.uid(), 'entrevistador') OR has_role(auth.uid(), 'tarefeiro')
    )
  );

CREATE POLICY "Admin e coordenador do tenant gerenciam excecoes - insert"
  ON public.excecoes_operacionais FOR INSERT TO authenticated
  WITH CHECK (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento'))
  );

CREATE POLICY "Admin e coordenador do tenant gerenciam excecoes - update"
  ON public.excecoes_operacionais FOR UPDATE TO authenticated
  USING (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento'))
  )
  WITH CHECK (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento'))
  );

CREATE POLICY "Admin e coordenador do tenant gerenciam excecoes - delete"
  ON public.excecoes_operacionais FOR DELETE TO authenticated
  USING (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento'))
  );

-- programacao_padrao
CREATE POLICY "Staff do tenant leem programacao padrao"
  ON public.programacao_padrao
  FOR SELECT TO authenticated
  USING (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (
      has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento')
      OR has_role(auth.uid(), 'entrevistador') OR has_role(auth.uid(), 'tarefeiro')
    )
  );

CREATE POLICY "Admin e coordenador do tenant gerenciam programacao - insert"
  ON public.programacao_padrao FOR INSERT TO authenticated
  WITH CHECK (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento'))
  );

CREATE POLICY "Admin e coordenador do tenant gerenciam programacao - update"
  ON public.programacao_padrao FOR UPDATE TO authenticated
  USING (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento'))
  )
  WITH CHECK (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento'))
  );

CREATE POLICY "Admin e coordenador do tenant gerenciam programacao - delete"
  ON public.programacao_padrao FOR DELETE TO authenticated
  USING (
    public.user_pertence_instituicao(auth.uid(), instituicao_id)
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'coordenador_de_tratamento'))
  );