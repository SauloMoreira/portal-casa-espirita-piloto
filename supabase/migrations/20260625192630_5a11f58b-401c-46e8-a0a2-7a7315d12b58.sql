CREATE OR REPLACE FUNCTION public.fn_fila_diagnostico_pendentes()
RETURNS TABLE(id uuid, motivo text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
  v_motivo text;
  v_pref record;
  v_classe text;
  v_now timestamptz := now();
  v_local timestamptz := now() AT TIME ZONE 'America/Sao_Paulo';
  v_local_min int;
  v_ini_min int;
  v_fim_min int;
  v_inicio text;
  v_fim text;
  v_count int;
  v_start_day timestamptz;
  v_operacionais text[] := ARRAY[
    'entrevista_criada','entrevista_lembrete','sessao_criada','sessao_lembrete',
    'remarcacao','cancelamento','presenca_registrada','falta_registrada','mensagem_manual'
  ];
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'administrador_master')
    OR public.has_role(auth.uid(), 'coordenador_de_tratamento')
  ) THEN
    RETURN;
  END IF;

  v_local_min := extract(hour from v_local) * 60 + extract(minute from v_local);
  v_start_day := (date_trunc('day', v_local)) AT TIME ZONE 'America/Sao_Paulo';

  FOR v_item IN
    SELECT * FROM notificacoes_fila WHERE status IN ('pendente', 'agendado')
  LOOP
    IF v_item.scheduled_at > v_now THEN
      id := v_item.id; motivo := 'agendado_futuro'; RETURN NEXT; CONTINUE;
    END IF;

    v_motivo := fn_fila_motivo_inelegivel(v_item.id);
    IF v_motivo IS NOT NULL THEN
      id := v_item.id; motivo := 'bloqueado_inelegivel:' || v_motivo; RETURN NEXT; CONTINUE;
    END IF;

    SELECT whatsapp_ativo, comunicacao_geral_ativa, horario_inicio_envio, horario_fim_envio
      INTO v_pref
      FROM notificacoes_preferencias
     WHERE assistido_id = v_item.assistido_id;

    IF v_pref.whatsapp_ativo IS NOT NULL AND v_pref.whatsapp_ativo = false THEN
      id := v_item.id; motivo := 'opt_out'; RETURN NEXT; CONTINUE;
    END IF;

    v_classe := CASE WHEN v_item.evento_origem::text = ANY(v_operacionais) THEN 'operacional' ELSE 'geral' END;
    IF v_classe = 'geral' AND v_pref.comunicacao_geral_ativa IS NOT NULL AND v_pref.comunicacao_geral_ativa = false THEN
      id := v_item.id; motivo := 'comunicacao_geral_desativada'; RETURN NEXT; CONTINUE;
    END IF;

    IF v_item.telefone_normalizado IS NULL OR v_item.telefone_normalizado = '' THEN
      id := v_item.id; motivo := 'sem_telefone'; RETURN NEXT; CONTINUE;
    END IF;

    v_inicio := COALESCE(v_pref.horario_inicio_envio::text, '08:00');
    v_fim := COALESCE(v_pref.horario_fim_envio::text, '20:00');
    v_ini_min := split_part(v_inicio, ':', 1)::int * 60 + split_part(v_inicio, ':', 2)::int;
    v_fim_min := split_part(v_fim, ':', 1)::int * 60 + split_part(v_fim, ':', 2)::int;
    IF NOT (v_local_min >= v_ini_min AND v_local_min < v_fim_min) THEN
      id := v_item.id; motivo := 'aguardando_janela'; RETURN NEXT; CONTINUE;
    END IF;

    SELECT count(*) INTO v_count
      FROM notificacoes_fila
     WHERE assistido_id = v_item.assistido_id
       AND status = 'enviado'
       AND sent_at >= v_start_day;
    IF v_count >= 3 THEN
      id := v_item.id; motivo := 'aguardando_limite_diario'; RETURN NEXT; CONTINUE;
    END IF;

    id := v_item.id; motivo := 'pendente'; RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;