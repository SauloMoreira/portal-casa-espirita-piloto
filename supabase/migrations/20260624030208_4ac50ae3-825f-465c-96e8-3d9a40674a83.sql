CREATE OR REPLACE FUNCTION public.fn_enfileirar_mensagem_manual(
  p_assistido_id uuid,
  p_mensagem text,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_phone text;
  v_whatsapp_ativo boolean;
  v_msg text := btrim(coalesce(p_mensagem, ''));
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_fila_id uuid;
  v_payload jsonb;
  v_dedupe text;
BEGIN
  -- 1) Permissão: somente perfis administrativos autorizados (validação no servidor).
  IF v_uid IS NULL
     OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'administrador_master')) THEN
    RAISE EXCEPTION 'permissao_negada'
      USING HINT = 'Apenas administradores podem enviar mensagem manual.';
  END IF;

  -- 2) Conteúdo: obrigatório, não vazio, com limite coerente.
  IF v_msg = '' THEN
    RAISE EXCEPTION 'mensagem_vazia' USING HINT = 'A mensagem não pode estar vazia.';
  END IF;
  IF char_length(v_msg) > 1000 THEN
    RAISE EXCEPTION 'mensagem_muito_longa' USING HINT = 'Limite de 1000 caracteres.';
  END IF;

  -- 3) Destinatário: precisa existir e ter telefone válido (normalizado).
  SELECT nome, public.fn_normalize_phone(coalesce(celular, telefone))
    INTO v_nome, v_phone
  FROM public.assistidos
  WHERE id = p_assistido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'destinatario_invalido' USING HINT = 'Assistido não encontrado.';
  END IF;
  IF v_phone IS NULL OR v_phone = '' THEN
    RAISE EXCEPTION 'sem_telefone' USING HINT = 'Destinatário sem telefone válido.';
  END IF;

  -- 4) Consentimento de canal: respeita opt-out já existente (sem alterá-lo).
  SELECT whatsapp_ativo INTO v_whatsapp_ativo
  FROM public.notificacoes_preferencias
  WHERE assistido_id = p_assistido_id;
  IF v_whatsapp_ativo IS NOT NULL AND v_whatsapp_ativo = false THEN
    RAISE EXCEPTION 'opt_out' USING HINT = 'Destinatário optou por não receber mensagens.';
  END IF;

  -- 5) Cria o item OFICIAL na fila, claramente rastreável como ação manual.
  v_dedupe := 'manual:' || gen_random_uuid()::text;
  v_payload := jsonb_build_object(
    'nome', v_nome,
    'mensagem', v_msg,
    'origem_manual', 'central_notificacoes',
    'tipo_acao', 'mensagem_manual',
    'enviado_por', v_uid,
    'observacao', v_obs,
    'criado_em', now()
  );

  INSERT INTO public.notificacoes_fila (
    evento_origem, assistido_id, telefone_normalizado, canal,
    template_codigo, payload_json, status, scheduled_at, dedupe_key
  ) VALUES (
    'mensagem_manual', p_assistido_id, v_phone, 'whatsapp',
    NULL, v_payload, 'pendente', now(), v_dedupe
  )
  RETURNING id INTO v_fila_id;

  -- 6) Trilha técnica no log da notificação.
  INSERT INTO public.notificacoes_log (fila_id, direcao, status, payload_enviado)
  VALUES (
    v_fila_id, 'saida', 'pendente',
    jsonb_build_object(
      'acao', 'mensagem_manual_enfileirada',
      'mensagem', v_msg,
      'telefone', v_phone,
      'origem_manual', 'central_notificacoes',
      'enviado_por', v_uid,
      'observacao', v_obs
    )
  );

  -- 7) Auditoria da ação humana.
  INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
  VALUES (
    v_uid,
    'enfileirar_mensagem_manual',
    'notificacoes_fila',
    v_fila_id,
    jsonb_build_object(
      'assistido_id', p_assistido_id,
      'assistido_nome', v_nome,
      'telefone', v_phone,
      'mensagem', v_msg,
      'origem_manual', 'central_notificacoes',
      'tipo_acao', 'mensagem_manual',
      'observacao', v_obs,
      'status_inicial', 'pendente'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'fila_id', v_fila_id,
    'assistido_id', p_assistido_id,
    'assistido_nome', v_nome,
    'telefone', v_phone,
    'status', 'pendente',
    'origem_manual', 'central_notificacoes',
    'enviado_por', v_uid
  );
END;
$function$;

-- Apenas usuários autenticados podem chamar; a função valida o papel internamente.
REVOKE ALL ON FUNCTION public.fn_enfileirar_mensagem_manual(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_enfileirar_mensagem_manual(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_enfileirar_mensagem_manual(uuid, text, text) TO service_role;