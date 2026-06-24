-- ===========================================================================
-- L-03 — Classificação geral × operacional de presença (fonte única backend)
-- ===========================================================================
-- presencas_tratamentos.status_presenca carrega a CLASSIFICAÇÃO GERAL
-- (leitura humana/histórica). A CLASSIFICAÇÃO OPERACIONAL (o que o sistema deve
-- fazer) passa a ser derivada de uma ÚNICA fonte oficial: fn_presenca_classificacao.
-- Nada de inferência paralela em UI/services soltos (INV-ARQ-001/002).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_presenca_classificacao(p_status text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE lower(coalesce(p_status, ''))
    WHEN 'presente' THEN jsonb_build_object(
      'status', 'presente',
      'classificacao_geral', 'presenca',
      'rotulo_geral', 'Presença',
      'classificacao_operacional', 'presenca_valida',
      'conta_presenca', true,
      'conta_ausencia', false,
      'dispara_remarcacao', false,
      'avanca_sessao', true,
      'somente_historico', false,
      'evento_notificacao', 'presenca_registrada'
    )
    WHEN 'ausente' THEN jsonb_build_object(
      'status', 'ausente',
      'classificacao_geral', 'ausencia',
      'rotulo_geral', 'Ausência',
      'classificacao_operacional', 'ausencia_valida',
      'conta_presenca', false,
      'conta_ausencia', true,
      'dispara_remarcacao', true,
      'avanca_sessao', false,
      'somente_historico', false,
      'evento_notificacao', 'falta_registrada'
    )
    WHEN 'justificado' THEN jsonb_build_object(
      'status', 'justificado',
      'classificacao_geral', 'ausencia_justificada',
      'rotulo_geral', 'Ausência justificada',
      'classificacao_operacional', 'somente_historico',
      'conta_presenca', false,
      'conta_ausencia', false,
      'dispara_remarcacao', false,
      'avanca_sessao', false,
      'somente_historico', true,
      'evento_notificacao', null
    )
    ELSE jsonb_build_object(
      'status', lower(coalesce(p_status, '')),
      'classificacao_geral', 'desconhecido',
      'rotulo_geral', 'Registro técnico',
      'classificacao_operacional', 'somente_historico',
      'conta_presenca', false,
      'conta_ausencia', false,
      'dispara_remarcacao', false,
      'avanca_sessao', false,
      'somente_historico', true,
      'evento_notificacao', null
    )
  END;
$function$;

COMMENT ON FUNCTION public.fn_presenca_classificacao(text) IS
  'L-03: fonte única oficial da classificação de presença. Mapeia status_presenca (classificação GERAL/histórica) para a classificação OPERACIONAL (conta_presenca, conta_ausencia, dispara_remarcacao, avanca_sessao, somente_historico, evento_notificacao). Backend é a fonte de verdade (INV-ARQ-001/002).';

-- ---------------------------------------------------------------------------
-- Refatora a notificação de presença para consultar a fonte única, em vez de
-- uma lista fixa de status. Comportamento preservado: 'presente' ->
-- presenca_registrada; 'ausente' -> falta_registrada; 'justificado'/demais ->
-- sem notificação (somente histórico). Dedupe e payload idênticos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notif_presenca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_assistido_id uuid;
  v_nome text;
  v_trat text;
  v_class jsonb;
  v_evento text;
BEGIN
  -- Fonte única: classificação operacional do registro.
  v_class := fn_presenca_classificacao(NEW.status_presenca);
  v_evento := v_class->>'evento_notificacao';

  -- Registros somente históricos (ex.: justificado) não geram aviso operacional.
  IF v_evento IS NULL THEN
    RETURN NEW;
  END IF;

  -- Em UPDATE, só dispara quando o status realmente muda.
  IF TG_OP = 'UPDATE' AND NEW.status_presenca = OLD.status_presenca THEN
    RETURN NEW;
  END IF;

  SELECT at.assistido_id, a.nome, t.nome
    INTO v_assistido_id, v_nome, v_trat
  FROM assistido_tratamentos at
  JOIN assistidos a ON a.id = at.assistido_id
  LEFT JOIN tipos_tratamento t ON t.id = at.tratamento_id
  WHERE at.id = NEW.assistido_tratamento_id;

  IF v_assistido_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM fn_enqueue_notificacao(
    v_evento, v_assistido_id, v_evento,
    jsonb_build_object('nome', v_nome, 'tratamento', v_trat, 'data', NEW.data),
    now(), v_evento||':'||NEW.id||':'||NEW.data::text);

  RETURN NEW;
END $function$;

GRANT EXECUTE ON FUNCTION public.fn_presenca_classificacao(text) TO authenticated, service_role, anon;