-- Passo 1: coluna nullable primeiro
ALTER TABLE public.tipos_tratamento
  ADD COLUMN IF NOT EXISTS instituicao_id uuid REFERENCES public.instituicoes(id);

-- Passo 2: backfill determinístico via created_by -> instituicao_usuarios.
DO $$
DECLARE
  v_ambiguas integer;
BEGIN
  SELECT count(*) INTO v_ambiguas
  FROM public.tipos_tratamento tt
  WHERE (
    SELECT count(DISTINCT iu.instituicao_id)
    FROM public.instituicao_usuarios iu
    WHERE iu.user_id = tt.created_by
  ) <> 1;

  IF v_ambiguas > 0 THEN
    RAISE EXCEPTION 'Existem % tratamento(s) cujo criador não resolve para exatamente uma instituição. Backfill automático abortado.', v_ambiguas;
  END IF;

  UPDATE public.tipos_tratamento tt
  SET instituicao_id = (
    SELECT iu.instituicao_id
    FROM public.instituicao_usuarios iu
    WHERE iu.user_id = tt.created_by
    LIMIT 1
  )
  WHERE tt.instituicao_id IS NULL;
END $$;

-- Passo 3: NOT NULL após backfill
ALTER TABLE public.tipos_tratamento ALTER COLUMN instituicao_id SET NOT NULL;

-- Passo 4: policies tenant-aware
DROP POLICY IF EXISTS "Admins manage tratamentos" ON public.tipos_tratamento;
DROP POLICY IF EXISTS "Authenticated can read tratamentos" ON public.tipos_tratamento;

CREATE POLICY "admin_instituicao gerencia tratamentos do tenant"
  ON public.tipos_tratamento
  FOR ALL TO authenticated
  USING (public.fn_is_admin_instituicao(auth.uid(), instituicao_id))
  WITH CHECK (public.fn_is_admin_instituicao(auth.uid(), instituicao_id));

CREATE POLICY "Membros leem tratamentos do proprio tenant"
  ON public.tipos_tratamento
  FOR SELECT TO authenticated
  USING (public.user_pertence_instituicao(auth.uid(), instituicao_id));