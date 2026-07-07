-- Q2-C3-B — Encerramento auditado de item OBSOLETO da fila de notificacoes.
-- RPC restritiva que encerra EXCLUSIVAMENTE itens em falha por
-- 'template_indisponivel' cujo payload traga 'nova_data' ja vencida
-- (comunicacao de remarcacao que perdeu validade temporal).
-- NAO reenvia, NAO chama dispatcher, NAO altera provider, templates, opt-out,
-- consentimento, preferencias, agenda, presenca, UI nem schema.
CREATE OR REPLACE FUNCTION public.fn_encerrar_item_fila_obsoleto(
  p_fila_id uuid,
  p_observacao text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.notificacoes_fila%ROWTYPE;
  v_nova_data date;
  v_encerramento jsonb;
BEGIN
  -- 1) Permissao: somente perfis administrativos autorizados.
  IF v_uid IS NULL
     OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'administrador_master')) THEN
    RAISE EXCEPTION 'permissao_negada'
      USING HINT = 'Apenas administradores podem encerrar itens obsoletos da fila.';
  END IF;

  -- 2) Item precisa existir.
  SELECT * INTO v_item FROM public.notificacoes_fila WHERE id = p_fila_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING HINT = 'Item da fila nao encontrado.';
  END IF;

  -- 3) Nao reprocessar itens ja enviados ou ja cancelados (idempotencia).
  IF v_item.sent_at IS NOT NULL OR v_item.external_message_id IS NOT NULL THEN
    RAISE EXCEPTION 'item_ja_enviado'
      USING HINT = 'Nao e possivel encerrar um item que ja foi enviado.';
  END IF;
  IF v_item.status = 'cancelado' THEN
    RAISE EXCEPTION 'item_ja_cancelado'
      USING HINT = 'Este item ja esta encerrado/cancelado.';
  END IF;

  -- 4) Predicados restritivos de elegibilidade (recorte Q2-C3-B).
  IF v_item.status <> 'falha'
     OR v_item.erro <> 'template_indisponivel'
     OR v_item.retry_count <> 0
     OR v_item.template_codigo <> 'tratamento_ausencia_remarcada' THEN
    RAISE EXCEPTION 'item_nao_elegivel'
      USING HINT = 'Esta acao so vale para itens em falha por template_indisponivel, sem tentativas, do fluxo de remarcacao.';
  END IF;

  -- 5) Obsolescencia temporal: nova_data do payload precisa estar vencida.
  BEGIN
    v_nova_data := (v_item.payload_json ->> 'nova_data')::date;
  EXCEPTION WHEN others THEN
    v_nova_data := NULL;
  END;
  IF v_nova_data IS NULL THEN
    RAISE EXCEPTION 'sem_nova_data'
      USING HINT = 'Item nao possui nova_data valida no payload.';
  END IF;
  IF v_nova_data >= CURRENT_DATE THEN
    RAISE EXCEPTION 'nova_data_futura'
      USING HINT = 'A remarcacao ainda e valida; item nao esta obsoleto.';
  END IF;

  -- 6) Encerrar SOMENTE o item atual, sem reenvio, preservando invariantes.
  v_encerramento := jsonb_build_object(
    'encerrado_manualmente', true,
    'origem_manual', 'central_notificacoes',
    'motivo_encerramento', 'item_obsoleto',
    'motivo_detalhado', 'remarcacao_com_data_passada',
    'motivo_anterior', v_item.erro,
    'nova_data_obsoleta', v_nova_data,
    'observacao', p_observacao,
    'encerrado_por', v_uid,
    'encerrado_em', now()
  );

  UPDATE public.notificacoes_fila
  SET status = 'cancelado',
      erro = 'item_obsoleto',
      payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object('encerramento', v_encerramento),
      updated_at = now()
  WHERE id = p_fila_id;
  -- Observacao: sent_at, external_message_id e retry_count permanecem intocados.

  -- 7) Trilha tecnica no log da notificacao (sem envio real).
  INSERT INTO public.notificacoes_log (fila_id, direcao, status, erro, payload_enviado)
  VALUES (
    p_fila_id, 'saida', 'cancelado', 'item_obsoleto',
    jsonb_build_object('acao', 'encerramento_item_obsoleto', 'detalhe', v_encerramento)
  );

  -- 8) Auditoria da acao humana.
  INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_anteriores, dados_novos)
  VALUES (
    v_uid,
    'encerrar_item_fila_obsoleto',
    'notificacoes_fila',
    p_fila_id,
    jsonb_build_object(
      'status', v_item.status,
      'erro', v_item.erro,
      'sent_at', v_item.sent_at,
      'external_message_id', v_item.external_message_id,
      'retry_count', v_item.retry_count,
      'template_codigo', v_item.template_codigo,
      'assistido_id', v_item.assistido_id,
      'nova_data', v_nova_data,
      'evento_origem', v_item.evento_origem
    ),
    jsonb_build_object(
      'status', 'cancelado',
      'erro', 'item_obsoleto',
      'motivo', 'remarcacao_com_data_passada',
      'sent_at', NULL,
      'external_message_id', NULL,
      'retry_count', v_item.retry_count,
      'encerramento', v_encerramento
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'fila_id', p_fila_id,
    'status', 'cancelado',
    'erro', 'item_obsoleto',
    'motivo', 'remarcacao_com_data_passada',
    'nova_data_obsoleta', v_nova_data,
    'encerrado_por', v_uid,
    'encerrado_em', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_encerrar_item_fila_obsoleto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_encerrar_item_fila_obsoleto(uuid, text) TO authenticated, service_role;