
-- 1) Novos valores no enum chamado_status
ALTER TYPE public.chamado_status ADD VALUE IF NOT EXISTS 'resolvido_pelo_suporte';
ALTER TYPE public.chamado_status ADD VALUE IF NOT EXISTS 'reaberto';
ALTER TYPE public.chamado_status ADD VALUE IF NOT EXISTS 'fechado_pelo_cliente';
ALTER TYPE public.chamado_status ADD VALUE IF NOT EXISTS 'fechado_administrativo';

-- 2) Tipo de solução (para "Marcar como resolvido")
DO $$ BEGIN
  CREATE TYPE public.chamado_resolucao_tipo AS ENUM (
    'correcao_tecnica_aplicada',
    'orientacao_operacional',
    'configuracao_ajustada',
    'documento_recebido',
    'solicitacao_comercial_tratada',
    'nao_reproduzido',
    'fora_do_escopo',
    'duplicidade',
    'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Categoria de fechamento administrativo
DO $$ BEGIN
  CREATE TYPE public.chamado_fechamento_categoria AS ENUM (
    'sem_retorno_cliente',
    'duplicidade',
    'chamado_cancelado',
    'fora_do_escopo',
    'resolvido_sem_confirmacao',
    'erro_nao_reproduzido',
    'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Colunas de resolução/fechamento em chamados_suporte
ALTER TABLE public.chamados_suporte
  ADD COLUMN IF NOT EXISTS resolucao_texto TEXT,
  ADD COLUMN IF NOT EXISTS resolucao_tipo public.chamado_resolucao_tipo,
  ADD COLUMN IF NOT EXISTS resolucao_por_user_id UUID,
  ADD COLUMN IF NOT EXISTS resolucao_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fechamento_texto TEXT,
  ADD COLUMN IF NOT EXISTS fechamento_categoria public.chamado_fechamento_categoria,
  ADD COLUMN IF NOT EXISTS fechado_por_user_id UUID,
  ADD COLUMN IF NOT EXISTS fechado_em TIMESTAMPTZ;

-- Helper: gravar mensagem no histórico bypassando RLS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public._chamado_registrar_evento(
  p_chamado_id UUID,
  p_instituicao_id UUID,
  p_autor UUID,
  p_mensagem TEXT,
  p_interno BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.chamado_mensagens (chamado_id, instituicao_id, autor_user_id, mensagem, interno)
  VALUES (p_chamado_id, p_instituicao_id, p_autor, p_mensagem, COALESCE(p_interno, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public._chamado_registrar_evento(uuid,uuid,uuid,text,boolean) FROM PUBLIC, anon;

-- Helper: audit_log com marcador padrão
CREATE OR REPLACE FUNCTION public._chamado_auditar(
  p_marcador TEXT,
  p_chamado_id UUID,
  p_instituicao_id UUID,
  p_actor UUID,
  p_payload JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, metadata, created_at)
    VALUES (
      p_actor,
      'saas06_c1_fix13_chamados_status:' || p_marcador,
      'chamados_suporte',
      p_chamado_id,
      COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('instituicao_id', p_instituicao_id),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Auditoria é best-effort; não pode quebrar o fluxo.
    NULL;
  END;
END $$;
REVOKE ALL ON FUNCTION public._chamado_auditar(text,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon;

-- ============================================================
-- RPCs de workflow
-- ============================================================

-- Assumir atendimento (platform_admin)
CREATE OR REPLACE FUNCTION public.fn_chamado_assumir(p_chamado_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_ch RECORD; v_prev TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA';
  END IF;
  SELECT * INTO v_ch FROM public.chamados_suporte WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAMADO_NAO_ENCONTRADO'; END IF;
  v_prev := v_ch.status::text;
  UPDATE public.chamados_suporte
     SET responsavel_user_id = v_uid,
         status = CASE WHEN status = 'aberto' THEN 'em_analise'::chamado_status ELSE status END
   WHERE id = p_chamado_id;
  PERFORM public._chamado_registrar_evento(
    p_chamado_id, v_ch.instituicao_id, v_uid,
    'Atendimento assumido pelo suporte.', false
  );
  PERFORM public._chamado_auditar('status_alterado', p_chamado_id, v_ch.instituicao_id, v_uid,
    jsonb_build_object('evento','assumir','de',v_prev,'para',
      CASE WHEN v_prev='aberto' THEN 'em_analise' ELSE v_prev END));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_chamado_assumir(uuid) TO authenticated;

-- Solicitar documento/informação (platform_admin)
CREATE OR REPLACE FUNCTION public.fn_chamado_solicitar_documento(
  p_chamado_id UUID,
  p_mensagem TEXT,
  p_apenas_informacao BOOLEAN DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_ch RECORD; v_prev TEXT; v_novo chamado_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_platform_admin(v_uid) THEN RAISE EXCEPTION 'PERMISSAO_NEGADA'; END IF;
  IF p_mensagem IS NULL OR length(btrim(p_mensagem)) < 3 THEN
    RAISE EXCEPTION 'MENSAGEM_OBRIGATORIA';
  END IF;
  SELECT * INTO v_ch FROM public.chamados_suporte WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAMADO_NAO_ENCONTRADO'; END IF;
  v_prev := v_ch.status::text;
  v_novo := CASE WHEN p_apenas_informacao THEN 'aguardando_cliente' ELSE 'aguardando_documento' END;
  UPDATE public.chamados_suporte SET status = v_novo WHERE id = p_chamado_id;
  PERFORM public._chamado_registrar_evento(p_chamado_id, v_ch.instituicao_id, v_uid, p_mensagem, false);
  PERFORM public._chamado_auditar(
    CASE WHEN p_apenas_informacao THEN 'status_alterado' ELSE 'documento_solicitado' END,
    p_chamado_id, v_ch.instituicao_id, v_uid,
    jsonb_build_object('de',v_prev,'para',v_novo::text));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_chamado_solicitar_documento(uuid,text,boolean) TO authenticated;

-- Marcar como resolvido (platform_admin) — solução obrigatória
CREATE OR REPLACE FUNCTION public.fn_chamado_marcar_resolvido(
  p_chamado_id UUID,
  p_solucao TEXT,
  p_tipo public.chamado_resolucao_tipo,
  p_observacao_interna TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_ch RECORD; v_prev TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_platform_admin(v_uid) THEN RAISE EXCEPTION 'PERMISSAO_NEGADA'; END IF;
  IF p_solucao IS NULL OR length(btrim(p_solucao)) < 5 THEN
    RAISE EXCEPTION 'SOLUCAO_OBRIGATORIA';
  END IF;
  IF p_tipo IS NULL THEN RAISE EXCEPTION 'TIPO_SOLUCAO_OBRIGATORIO'; END IF;
  SELECT * INTO v_ch FROM public.chamados_suporte WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAMADO_NAO_ENCONTRADO'; END IF;
  v_prev := v_ch.status::text;
  UPDATE public.chamados_suporte
     SET status = 'resolvido_pelo_suporte'::chamado_status,
         resolucao_texto = p_solucao,
         resolucao_tipo = p_tipo,
         resolucao_por_user_id = v_uid,
         resolucao_em = now()
   WHERE id = p_chamado_id;
  PERFORM public._chamado_registrar_evento(
    p_chamado_id, v_ch.instituicao_id, v_uid,
    'Solução aplicada pelo suporte: ' || p_solucao, false
  );
  IF p_observacao_interna IS NOT NULL AND length(btrim(p_observacao_interna)) > 0 THEN
    PERFORM public._chamado_registrar_evento(
      p_chamado_id, v_ch.instituicao_id, v_uid,
      p_observacao_interna, true
    );
  END IF;
  PERFORM public._chamado_auditar('chamado_resolvido', p_chamado_id, v_ch.instituicao_id, v_uid,
    jsonb_build_object('de',v_prev,'para','resolvido_pelo_suporte','tipo',p_tipo::text));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_chamado_marcar_resolvido(uuid,text,public.chamado_resolucao_tipo,text) TO authenticated;

-- Cliente fecha chamado
CREATE OR REPLACE FUNCTION public.fn_chamado_fechar_cliente(
  p_chamado_id UUID,
  p_atendido BOOLEAN,
  p_comentario TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_ch RECORD; v_prev TEXT; v_pode BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_comentario IS NULL OR length(btrim(p_comentario)) < 3 THEN
    RAISE EXCEPTION 'COMENTARIO_OBRIGATORIO';
  END IF;
  SELECT * INTO v_ch FROM public.chamados_suporte WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAMADO_NAO_ENCONTRADO'; END IF;
  -- Só o autor, admin da instituição ou platform_admin podem executar esta ação
  v_pode := (v_ch.criado_por_user_id = v_uid)
         OR public.fn_is_admin_instituicao(v_uid, v_ch.instituicao_id)
         OR public.is_platform_admin(v_uid);
  IF NOT v_pode THEN RAISE EXCEPTION 'PERMISSAO_NEGADA'; END IF;
  IF v_ch.status IN ('fechado_pelo_cliente','fechado_administrativo','cancelado') THEN
    RAISE EXCEPTION 'CHAMADO_JA_ENCERRADO';
  END IF;
  v_prev := v_ch.status::text;

  IF p_atendido THEN
    UPDATE public.chamados_suporte
       SET status = 'fechado_pelo_cliente'::chamado_status,
           fechado_por_user_id = v_uid,
           fechado_em = now(),
           concluido_em = now()
     WHERE id = p_chamado_id;
    PERFORM public._chamado_registrar_evento(
      p_chamado_id, v_ch.instituicao_id, v_uid,
      'Cliente confirmou o atendimento e fechou o chamado. Comentário: ' || p_comentario, false
    );
    PERFORM public._chamado_auditar('chamado_fechado_cliente', p_chamado_id, v_ch.instituicao_id, v_uid,
      jsonb_build_object('de',v_prev,'para','fechado_pelo_cliente'));
  ELSE
    UPDATE public.chamados_suporte
       SET status = CASE
             WHEN status = 'resolvido_pelo_suporte' THEN 'reaberto'::chamado_status
             ELSE 'aguardando_administrador_global'::chamado_status
           END,
           concluido_em = NULL
     WHERE id = p_chamado_id;
    PERFORM public._chamado_registrar_evento(
      p_chamado_id, v_ch.instituicao_id, v_uid,
      'Cliente informou que ainda precisa de ajuda. Comentário: ' || p_comentario, false
    );
    PERFORM public._chamado_auditar(
      CASE WHEN v_prev = 'resolvido_pelo_suporte' THEN 'chamado_reaberto' ELSE 'status_alterado' END,
      p_chamado_id, v_ch.instituicao_id, v_uid,
      jsonb_build_object('de',v_prev,'para',
        CASE WHEN v_prev='resolvido_pelo_suporte' THEN 'reaberto' ELSE 'aguardando_administrador_global' END));
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_chamado_fechar_cliente(uuid,boolean,text) TO authenticated;

-- Fechamento administrativo (platform_admin)
CREATE OR REPLACE FUNCTION public.fn_chamado_fechar_administrativo(
  p_chamado_id UUID,
  p_motivo TEXT,
  p_categoria public.chamado_fechamento_categoria,
  p_observacao_interna TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_ch RECORD; v_prev TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_platform_admin(v_uid) THEN RAISE EXCEPTION 'PERMISSAO_NEGADA'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  IF p_categoria IS NULL THEN RAISE EXCEPTION 'CATEGORIA_OBRIGATORIA'; END IF;
  SELECT * INTO v_ch FROM public.chamados_suporte WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAMADO_NAO_ENCONTRADO'; END IF;
  IF v_ch.status IN ('fechado_pelo_cliente','fechado_administrativo','cancelado') THEN
    RAISE EXCEPTION 'CHAMADO_JA_ENCERRADO';
  END IF;
  v_prev := v_ch.status::text;
  UPDATE public.chamados_suporte
     SET status = 'fechado_administrativo'::chamado_status,
         fechamento_texto = p_motivo,
         fechamento_categoria = p_categoria,
         fechado_por_user_id = v_uid,
         fechado_em = now(),
         concluido_em = now()
   WHERE id = p_chamado_id;
  PERFORM public._chamado_registrar_evento(
    p_chamado_id, v_ch.instituicao_id, v_uid,
    'Chamado fechado administrativamente. Motivo: ' || p_motivo || ' (categoria: ' || p_categoria::text || ')', false
  );
  IF p_observacao_interna IS NOT NULL AND length(btrim(p_observacao_interna)) > 0 THEN
    PERFORM public._chamado_registrar_evento(p_chamado_id, v_ch.instituicao_id, v_uid, p_observacao_interna, true);
  END IF;
  PERFORM public._chamado_auditar('chamado_fechado_administrativo', p_chamado_id, v_ch.instituicao_id, v_uid,
    jsonb_build_object('de',v_prev,'para','fechado_administrativo','categoria',p_categoria::text));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_chamado_fechar_administrativo(uuid,text,public.chamado_fechamento_categoria,text) TO authenticated;

-- Cancelar chamado (platform_admin OU autor enquanto ainda 'aberto')
CREATE OR REPLACE FUNCTION public.fn_chamado_cancelar(
  p_chamado_id UUID,
  p_motivo TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_ch RECORD; v_prev TEXT; v_pode BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO v_ch FROM public.chamados_suporte WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAMADO_NAO_ENCONTRADO'; END IF;
  v_pode := public.is_platform_admin(v_uid)
         OR (v_ch.criado_por_user_id = v_uid AND v_ch.status = 'aberto');
  IF NOT v_pode THEN RAISE EXCEPTION 'PERMISSAO_NEGADA'; END IF;
  IF v_ch.status IN ('fechado_pelo_cliente','fechado_administrativo','cancelado') THEN
    RAISE EXCEPTION 'CHAMADO_JA_ENCERRADO';
  END IF;
  v_prev := v_ch.status::text;
  UPDATE public.chamados_suporte
     SET status = 'cancelado'::chamado_status,
         fechado_por_user_id = v_uid,
         fechado_em = now(),
         concluido_em = now(),
         fechamento_texto = COALESCE(fechamento_texto, p_motivo)
   WHERE id = p_chamado_id;
  PERFORM public._chamado_registrar_evento(
    p_chamado_id, v_ch.instituicao_id, v_uid,
    'Chamado cancelado. Motivo: ' || p_motivo, false
  );
  PERFORM public._chamado_auditar('chamado_cancelado', p_chamado_id, v_ch.instituicao_id, v_uid,
    jsonb_build_object('de',v_prev,'para','cancelado'));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_chamado_cancelar(uuid,text) TO authenticated;

-- Reabrir chamado após fechamento pelo cliente (autor / admin local / platform_admin)
CREATE OR REPLACE FUNCTION public.fn_chamado_reabrir(
  p_chamado_id UUID,
  p_motivo TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_ch RECORD; v_prev TEXT; v_pode BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO v_ch FROM public.chamados_suporte WHERE id = p_chamado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAMADO_NAO_ENCONTRADO'; END IF;
  v_pode := public.is_platform_admin(v_uid)
         OR v_ch.criado_por_user_id = v_uid
         OR public.fn_is_admin_instituicao(v_uid, v_ch.instituicao_id);
  IF NOT v_pode THEN RAISE EXCEPTION 'PERMISSAO_NEGADA'; END IF;
  IF v_ch.status NOT IN ('fechado_pelo_cliente','resolvido_pelo_suporte') THEN
    RAISE EXCEPTION 'REABERTURA_NAO_PERMITIDA';
  END IF;
  v_prev := v_ch.status::text;
  UPDATE public.chamados_suporte
     SET status = 'reaberto'::chamado_status,
         concluido_em = NULL,
         fechado_em = NULL,
         fechado_por_user_id = NULL
   WHERE id = p_chamado_id;
  PERFORM public._chamado_registrar_evento(
    p_chamado_id, v_ch.instituicao_id, v_uid,
    'Chamado reaberto. Motivo: ' || p_motivo, false
  );
  PERFORM public._chamado_auditar('chamado_reaberto', p_chamado_id, v_ch.instituicao_id, v_uid,
    jsonb_build_object('de',v_prev,'para','reaberto'));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_chamado_reabrir(uuid,text) TO authenticated;
