
-- =====================================================================
-- SAAS-06-C1-FIX10 — Central de Chamados com anexos (multi-tenant)
-- =====================================================================

-- 1) ENUMs -------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.chamado_tipo AS ENUM (
    'tecnico','operacional','comercial','cobranca',
    'contrato_documento','melhoria','incidente'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chamado_status AS ENUM (
    'aberto','em_analise','aguardando_cliente',
    'aguardando_administrador_global','aguardando_documento',
    'resolvido','cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chamado_prioridade AS ENUM ('baixa','normal','alta','critica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chamado_visibilidade AS ENUM ('instituicao','autor_e_platform_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) chamados_suporte -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chamados_suporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instituicao_id uuid NOT NULL REFERENCES public.instituicoes(id) ON DELETE CASCADE,
  criado_por_user_id uuid NOT NULL,
  responsavel_user_id uuid NULL,
  tipo public.chamado_tipo NOT NULL DEFAULT 'tecnico',
  origem text NULL,
  assunto text NOT NULL,
  descricao text NOT NULL,
  codigo_tecnico text NULL,
  prioridade public.chamado_prioridade NOT NULL DEFAULT 'normal',
  status public.chamado_status NOT NULL DEFAULT 'aberto',
  visibilidade public.chamado_visibilidade NOT NULL DEFAULT 'instituicao',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz NULL,
  CONSTRAINT chamados_suporte_assunto_len CHECK (char_length(assunto) BETWEEN 3 AND 200),
  CONSTRAINT chamados_suporte_descricao_len CHECK (char_length(descricao) BETWEEN 1 AND 5000)
);
CREATE INDEX IF NOT EXISTS chamados_suporte_inst_status_idx
  ON public.chamados_suporte(instituicao_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS chamados_suporte_criador_idx
  ON public.chamados_suporte(criado_por_user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.chamados_suporte TO authenticated;
GRANT ALL ON public.chamados_suporte TO service_role;
ALTER TABLE public.chamados_suporte ENABLE ROW LEVEL SECURITY;

-- 3) chamado_mensagens ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chamado_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id uuid NOT NULL REFERENCES public.chamados_suporte(id) ON DELETE CASCADE,
  instituicao_id uuid NOT NULL REFERENCES public.instituicoes(id) ON DELETE CASCADE,
  autor_user_id uuid NOT NULL,
  mensagem text NOT NULL,
  interno boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chamado_mensagens_len CHECK (char_length(mensagem) BETWEEN 1 AND 5000)
);
CREATE INDEX IF NOT EXISTS chamado_mensagens_chamado_idx
  ON public.chamado_mensagens(chamado_id, created_at);

GRANT SELECT, INSERT ON public.chamado_mensagens TO authenticated;
GRANT ALL ON public.chamado_mensagens TO service_role;
ALTER TABLE public.chamado_mensagens ENABLE ROW LEVEL SECURITY;

-- 4) chamado_anexos ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chamado_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id uuid NOT NULL REFERENCES public.chamados_suporte(id) ON DELETE CASCADE,
  mensagem_id uuid NULL REFERENCES public.chamado_mensagens(id) ON DELETE SET NULL,
  instituicao_id uuid NOT NULL REFERENCES public.instituicoes(id) ON DELETE CASCADE,
  enviado_por_user_id uuid NOT NULL,
  nome_arquivo text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  tamanho_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chamado_anexos_tamanho CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 10 * 1024 * 1024),
  CONSTRAINT chamado_anexos_mime CHECK (mime_type IN (
    'image/png','image/jpeg','application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ))
);
CREATE INDEX IF NOT EXISTS chamado_anexos_chamado_idx
  ON public.chamado_anexos(chamado_id, created_at);

GRANT SELECT, INSERT ON public.chamado_anexos TO authenticated;
GRANT ALL ON public.chamado_anexos TO service_role;
ALTER TABLE public.chamado_anexos ENABLE ROW LEVEL SECURITY;

-- 5) updated_at trigger ----------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_chamados_suporte_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_chamados_suporte_updated_at ON public.chamados_suporte;
CREATE TRIGGER trg_chamados_suporte_updated_at
  BEFORE UPDATE ON public.chamados_suporte
  FOR EACH ROW EXECUTE FUNCTION public.tg_chamados_suporte_updated_at();

-- 6) Helper: usuário pode ver chamado? --------------------------------
CREATE OR REPLACE FUNCTION public.fn_pode_ver_chamado(_user uuid, _chamado_id uuid, _inst uuid, _criador uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_platform_admin(_user)
    OR public.fn_is_admin_instituicao(_user, _inst)
    OR (_criador = _user)
$$;
REVOKE ALL ON FUNCTION public.fn_pode_ver_chamado(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pode_ver_chamado(uuid,uuid,uuid,uuid) TO authenticated, service_role;

-- 7) RLS chamados_suporte --------------------------------------------
DROP POLICY IF EXISTS chamados_suporte_select ON public.chamados_suporte;
CREATE POLICY chamados_suporte_select ON public.chamados_suporte
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
    OR criado_por_user_id = auth.uid()
  );

DROP POLICY IF EXISTS chamados_suporte_insert ON public.chamados_suporte;
CREATE POLICY chamados_suporte_insert ON public.chamados_suporte
  FOR INSERT TO authenticated
  WITH CHECK (
    criado_por_user_id = auth.uid()
    AND (
      public.is_platform_admin(auth.uid())
      OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
      OR EXISTS (
        SELECT 1 FROM public.instituicao_usuarios iu
         WHERE iu.user_id = auth.uid()
           AND iu.instituicao_id = chamados_suporte.instituicao_id
           AND iu.status = 'ativo'
      )
    )
  );

DROP POLICY IF EXISTS chamados_suporte_update ON public.chamados_suporte;
CREATE POLICY chamados_suporte_update ON public.chamados_suporte
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.fn_is_admin_instituicao(auth.uid(), instituicao_id)
  );

-- 8) RLS chamado_mensagens -------------------------------------------
DROP POLICY IF EXISTS chamado_mensagens_select ON public.chamado_mensagens;
CREATE POLICY chamado_mensagens_select ON public.chamado_mensagens
  FOR SELECT TO authenticated
  USING (
    (interno = false OR public.is_platform_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.chamados_suporte c
       WHERE c.id = chamado_mensagens.chamado_id
         AND (
           public.is_platform_admin(auth.uid())
           OR public.fn_is_admin_instituicao(auth.uid(), c.instituicao_id)
           OR c.criado_por_user_id = auth.uid()
         )
    )
  );

DROP POLICY IF EXISTS chamado_mensagens_insert ON public.chamado_mensagens;
CREATE POLICY chamado_mensagens_insert ON public.chamado_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (
    autor_user_id = auth.uid()
    AND (interno = false OR public.is_platform_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.chamados_suporte c
       WHERE c.id = chamado_mensagens.chamado_id
         AND c.instituicao_id = chamado_mensagens.instituicao_id
         AND (
           public.is_platform_admin(auth.uid())
           OR public.fn_is_admin_instituicao(auth.uid(), c.instituicao_id)
           OR c.criado_por_user_id = auth.uid()
         )
    )
  );

-- 9) RLS chamado_anexos ----------------------------------------------
DROP POLICY IF EXISTS chamado_anexos_select ON public.chamado_anexos;
CREATE POLICY chamado_anexos_select ON public.chamado_anexos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chamados_suporte c
       WHERE c.id = chamado_anexos.chamado_id
         AND c.instituicao_id = chamado_anexos.instituicao_id
         AND (
           public.is_platform_admin(auth.uid())
           OR public.fn_is_admin_instituicao(auth.uid(), c.instituicao_id)
           OR c.criado_por_user_id = auth.uid()
         )
    )
  );

DROP POLICY IF EXISTS chamado_anexos_insert ON public.chamado_anexos;
CREATE POLICY chamado_anexos_insert ON public.chamado_anexos
  FOR INSERT TO authenticated
  WITH CHECK (
    enviado_por_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chamados_suporte c
       WHERE c.id = chamado_anexos.chamado_id
         AND c.instituicao_id = chamado_anexos.instituicao_id
         AND (
           public.is_platform_admin(auth.uid())
           OR public.fn_is_admin_instituicao(auth.uid(), c.instituicao_id)
           OR c.criado_por_user_id = auth.uid()
         )
    )
  );

-- 10) RPC fn_abrir_chamado_tecnico -----------------------------------
CREATE OR REPLACE FUNCTION public.fn_abrir_chamado_tecnico(
  p_instituicao_id uuid,
  p_origem text,
  p_assunto text,
  p_descricao text,
  p_codigo_tecnico text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF p_instituicao_id IS NULL THEN
    RAISE EXCEPTION 'instituicao_id obrigatório' USING ERRCODE = '23502';
  END IF;

  -- Precisa ter vínculo ativo OU ser platform_admin
  IF NOT (
    public.is_platform_admin(v_user)
    OR EXISTS (
      SELECT 1 FROM public.instituicao_usuarios iu
       WHERE iu.user_id = v_user
         AND iu.instituicao_id = p_instituicao_id
         AND iu.status = 'ativo'
    )
  ) THEN
    RAISE EXCEPTION 'sem vínculo ativo com a instituição' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.chamados_suporte (
    instituicao_id, criado_por_user_id, tipo, origem, assunto,
    descricao, codigo_tecnico, prioridade, status, metadata
  ) VALUES (
    p_instituicao_id, v_user, 'tecnico',
    COALESCE(p_origem, 'desconhecida'),
    COALESCE(NULLIF(trim(p_assunto), ''), 'Erro técnico'),
    COALESCE(NULLIF(trim(p_descricao), ''), 'Sem descrição informada.'),
    p_codigo_tecnico,
    'normal', 'aberto',
    COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_user, 'saas06_c1_fix10_chamados:criado_tecnico', 'chamados_suporte',
          v_id, jsonb_build_object('codigo_tecnico', p_codigo_tecnico, 'origem', p_origem));

  RETURN v_id;
EXCEPTION WHEN undefined_table THEN
  -- audit_logs opcional
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_abrir_chamado_tecnico(uuid,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_abrir_chamado_tecnico(uuid,text,text,text,text,jsonb) TO authenticated;

-- 11) Storage policies para bucket suporte-anexos --------------------
-- Path: <instituicao_id>/<chamado_id>/<uuid>-<nome>

DROP POLICY IF EXISTS suporte_anexos_select ON storage.objects;
CREATE POLICY suporte_anexos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'suporte-anexos'
    AND EXISTS (
      SELECT 1 FROM public.chamado_anexos a
       WHERE a.storage_path = storage.objects.name
    )
    -- RLS de chamado_anexos já filtra o que o usuário pode ver.
  );

DROP POLICY IF EXISTS suporte_anexos_insert ON storage.objects;
CREATE POLICY suporte_anexos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'suporte-anexos'
    AND (
      -- Aceita platform_admin OU membro ativo da instituição no primeiro segmento do path
      public.is_platform_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.instituicao_usuarios iu
         WHERE iu.user_id = auth.uid()
           AND iu.status = 'ativo'
           AND iu.instituicao_id::text = split_part(storage.objects.name, '/', 1)
      )
    )
  );

DROP POLICY IF EXISTS suporte_anexos_delete ON storage.objects;
CREATE POLICY suporte_anexos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'suporte-anexos'
    AND public.is_platform_admin(auth.uid())
  );
