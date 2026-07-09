
-- ==================================================================
-- SAAS-06-B0.4 (ext.) — Solicitações comerciais + notificações persistentes
-- ==================================================================

-- 1) Amplia enums via CHECK (drop & recreate)
ALTER TABLE public.solicitacoes_comerciais
  DROP CONSTRAINT IF EXISTS solicitacoes_comerciais_tipo_check;
ALTER TABLE public.solicitacoes_comerciais
  DROP CONSTRAINT IF EXISTS solicitacoes_comerciais_status_check;

ALTER TABLE public.solicitacoes_comerciais
  ADD CONSTRAINT solicitacoes_comerciais_tipo_check CHECK (tipo IN (
    -- históricos (SAAS-06-B0.4 inicial) mantidos por compatibilidade
    'novo_modulo','desabilitar_modulo','alterar_plano',
    'segunda_via_cobranca','cancelamento','contato_comercial','outro',
    -- novos (extensão)
    'solicitar_novo_modulo','solicitar_desabilitar_modulo',
    'informar_pagamento','solicitar_cancelamento',
    'falar_com_comercial','suporte_comercial'
  ));

ALTER TABLE public.solicitacoes_comerciais
  ADD CONSTRAINT solicitacoes_comerciais_status_check CHECK (status IN (
    'pendente','em_analise','aguardando_cliente','aguardando_pagamento',
    'aprovada','recusada','concluida','cancelada'
  ));

-- 2) Colunas de notificação/atendimento
ALTER TABLE public.solicitacoes_comerciais
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'normal'
    CHECK (prioridade IN ('normal','alta','critica')),
  ADD COLUMN IF NOT EXISTS primeiro_alerta_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_alerta_em timestamptz,
  ADD COLUMN IF NOT EXISTS proximo_alerta_em timestamptz,
  ADD COLUMN IF NOT EXISTS quantidade_alertas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS responsavel_user_id uuid,
  ADD COLUMN IF NOT EXISTS atendimento_assumido_em timestamptz,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE INDEX IF NOT EXISTS solicitacoes_comerciais_proximo_alerta_idx
  ON public.solicitacoes_comerciais(proximo_alerta_em)
  WHERE status = 'pendente' AND proximo_alerta_em IS NOT NULL;

-- 3) Helper: adiciona horas "úteis" pulando sábados/domingos
CREATE OR REPLACE FUNCTION public.fn_add_business_hours(_base timestamptz, _hours integer)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cursor_ts timestamptz := _base;
  remaining integer := _hours;
  step integer;
  dow int;
BEGIN
  IF _hours <= 0 THEN
    RETURN _base;
  END IF;
  WHILE remaining > 0 LOOP
    dow := EXTRACT(ISODOW FROM cursor_ts);
    -- Se for fim de semana, pula para segunda 00:00
    IF dow = 6 THEN
      cursor_ts := date_trunc('day', cursor_ts) + interval '2 days';
      CONTINUE;
    ELSIF dow = 7 THEN
      cursor_ts := date_trunc('day', cursor_ts) + interval '1 day';
      CONTINUE;
    END IF;
    step := LEAST(remaining, 24);
    cursor_ts := cursor_ts + make_interval(hours => step);
    remaining := remaining - step;
  END LOOP;
  RETURN cursor_ts;
END;
$$;

-- 4) Helper: intervalo do próximo alerta com base no nº de alertas já enviados
-- 0 → +2h · 1 → +24h · 2 → +48h · 3 → +72h · 4+ → +72h (com prioridade crítica)
CREATE OR REPLACE FUNCTION public.fn_solicitacao_proximo_alerta(_base timestamptz, _qtd integer)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.fn_add_business_hours(
    _base,
    CASE
      WHEN _qtd <= 0 THEN 2
      WHEN _qtd = 1 THEN 24
      WHEN _qtd = 2 THEN 48
      ELSE 72
    END
  );
$$;

-- 5) Trigger AFTER INSERT: agenda alerta imediato + audita
CREATE OR REPLACE FUNCTION public.fn_solicitacao_comercial_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.solicitacoes_comerciais
     SET proximo_alerta_em = COALESCE(proximo_alerta_em, now()),
         dedupe_key = COALESCE(dedupe_key, NEW.id::text || ':0')
   WHERE id = NEW.id;

  INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
  VALUES (
    NEW.solicitante_user_id,
    'saas06_b04_solicitacao_comercial_alerta:solicitacao_criada',
    'solicitacoes_comerciais',
    NEW.id,
    jsonb_build_object(
      'instituicao_id', NEW.instituicao_id,
      'tipo', NEW.tipo,
      'status', NEW.status,
      'modulo_codigo', NEW.modulo_codigo
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitacao_comercial_after_insert ON public.solicitacoes_comerciais;
CREATE TRIGGER trg_solicitacao_comercial_after_insert
  AFTER INSERT ON public.solicitacoes_comerciais
  FOR EACH ROW EXECUTE FUNCTION public.fn_solicitacao_comercial_after_insert();

-- 6) Trigger BEFORE UPDATE: interrompe repetição quando status sai de pendente
--    e audita mudança de status.
CREATE OR REPLACE FUNCTION public.fn_solicitacao_comercial_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pendente' AND NEW.status <> 'pendente' THEN
      NEW.proximo_alerta_em := NULL;
    END IF;
    IF NEW.status IN ('aprovada','recusada','concluida','cancelada') THEN
      NEW.concluida_em := COALESCE(NEW.concluida_em, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitacao_comercial_before_update ON public.solicitacoes_comerciais;
CREATE TRIGGER trg_solicitacao_comercial_before_update
  BEFORE UPDATE ON public.solicitacoes_comerciais
  FOR EACH ROW EXECUTE FUNCTION public.fn_solicitacao_comercial_before_update();

CREATE OR REPLACE FUNCTION public.fn_solicitacao_comercial_after_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_anteriores, dados_novos)
    VALUES (
      auth.uid(),
      'saas06_b04_solicitacao_comercial_alerta:status_alterado',
      'solicitacoes_comerciais',
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status,
                         'observacao_interna', NEW.observacao_interna,
                         'responsavel_user_id', NEW.responsavel_user_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitacao_comercial_after_update ON public.solicitacoes_comerciais;
CREATE TRIGGER trg_solicitacao_comercial_after_update
  AFTER UPDATE ON public.solicitacoes_comerciais
  FOR EACH ROW EXECUTE FUNCTION public.fn_solicitacao_comercial_after_update();

-- 7) RPC — platform_admin assume atendimento
CREATE OR REPLACE FUNCTION public.fn_assumir_solicitacao_comercial(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado';
  END IF;
  IF NOT public.fn_is_platform_admin(v_user) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  UPDATE public.solicitacoes_comerciais
     SET responsavel_user_id = v_user,
         atendimento_assumido_em = COALESCE(atendimento_assumido_em, now()),
         proximo_alerta_em = NULL,
         status = CASE WHEN status = 'pendente' THEN 'em_analise' ELSE status END,
         updated_at = now()
   WHERE id = _id;

  INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
  VALUES (
    v_user,
    'saas06_b04_solicitacao_comercial_alerta:atendimento_assumido',
    'solicitacoes_comerciais',
    _id,
    jsonb_build_object('responsavel_user_id', v_user, 'assumido_em', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_assumir_solicitacao_comercial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assumir_solicitacao_comercial(uuid) TO authenticated, service_role;

-- 8) RPC — processa a fila de alertas devidos (idempotente por dedupe_key)
CREATE OR REPLACE FUNCTION public.fn_processar_alertas_comerciais()
RETURNS TABLE(id uuid, quantidade_alertas integer, prioridade text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_key text;
  v_next timestamptz;
  v_qtd integer;
  v_prior text;
BEGIN
  FOR r IN
    SELECT s.*
      FROM public.solicitacoes_comerciais s
     WHERE s.status = 'pendente'
       AND s.proximo_alerta_em IS NOT NULL
       AND s.proximo_alerta_em <= now()
     ORDER BY s.proximo_alerta_em ASC
     LIMIT 200
     FOR UPDATE SKIP LOCKED
  LOOP
    v_qtd := r.quantidade_alertas + 1;
    v_key := r.id::text || ':' || v_qtd::text;

    -- Idempotência: se já auditou este ciclo, apenas avança o next e continua
    IF EXISTS (
      SELECT 1 FROM public.audit_logs
       WHERE tabela = 'solicitacoes_comerciais'
         AND registro_id = r.id
         AND acao = 'saas06_b04_solicitacao_comercial_alerta:alerta_enviado'
         AND (dados_novos->>'dedupe_key') = v_key
    ) THEN
      UPDATE public.solicitacoes_comerciais
         SET proximo_alerta_em = public.fn_solicitacao_proximo_alerta(now(), v_qtd)
       WHERE id = r.id;
      CONTINUE;
    END IF;

    v_next := public.fn_solicitacao_proximo_alerta(now(), v_qtd);
    v_prior := CASE
      WHEN v_qtd >= 4 THEN 'critica'
      WHEN v_qtd >= 3 THEN 'alta'
      ELSE r.prioridade
    END;

    UPDATE public.solicitacoes_comerciais
       SET quantidade_alertas = v_qtd,
           ultimo_alerta_em = now(),
           primeiro_alerta_em = COALESCE(primeiro_alerta_em, now()),
           proximo_alerta_em = v_next,
           prioridade = v_prior,
           dedupe_key = v_key,
           updated_at = now()
     WHERE id = r.id;

    INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
    VALUES (
      NULL,
      'saas06_b04_solicitacao_comercial_alerta:alerta_enviado',
      'solicitacoes_comerciais',
      r.id,
      jsonb_build_object(
        'dedupe_key', v_key,
        'quantidade_alertas', v_qtd,
        'prioridade', v_prior,
        'proximo_alerta_em', v_next,
        'canal', 'central_notificacoes_admin'
      )
    );

    id := r.id;
    quantidade_alertas := v_qtd;
    prioridade := v_prior;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_processar_alertas_comerciais() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_processar_alertas_comerciais() TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_processar_alertas_comerciais() IS
  'SAAS-06-B0.4 — processa fila de alertas comerciais pendentes; idempotente por (registro_id, dedupe_key).';
