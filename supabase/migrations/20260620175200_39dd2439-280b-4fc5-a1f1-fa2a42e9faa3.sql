CREATE OR REPLACE FUNCTION public.fn_notif_presenca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_assistido_id uuid;
  v_nome text;
  v_trat text;
  v_status text;
BEGIN
  v_status := NEW.status_presenca;

  -- Apenas eventos de presença/falta efetivos geram aviso.
  IF v_status NOT IN ('presente', 'ausente') THEN
    RETURN NEW;
  END IF;

  -- Em UPDATE, só dispara quando o status realmente muda para presente/ausente.
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

  IF v_status = 'presente' THEN
    PERFORM fn_enqueue_notificacao(
      'presenca_registrada', v_assistido_id, 'presenca_registrada',
      jsonb_build_object('nome', v_nome, 'tratamento', v_trat, 'data', NEW.data),
      now(), 'presenca_registrada:'||NEW.id||':'||NEW.data::text);
  ELSE
    PERFORM fn_enqueue_notificacao(
      'falta_registrada', v_assistido_id, 'falta_registrada',
      jsonb_build_object('nome', v_nome, 'tratamento', v_trat, 'data', NEW.data),
      now(), 'falta_registrada:'||NEW.id||':'||NEW.data::text);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notif_presenca ON public.presencas_tratamentos;
CREATE TRIGGER trg_notif_presenca
  AFTER INSERT OR UPDATE ON public.presencas_tratamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_notif_presenca();

INSERT INTO public.notificacoes_templates (codigo_template, tipo_evento, canal, titulo_interno, corpo_template) VALUES
('presenca_registrada','presenca_registrada','whatsapp','Presença registrada',
 'Olá, {{nome}}! 🌿 Sua presença na sessão de {{tratamento}} em {{data}} foi registrada. Que bom contar com você. Seguimos juntos!'),
('falta_registrada','falta_registrada','whatsapp','Falta registrada',
 'Olá, {{nome}}! 🌿 Notamos sua ausência na sessão de {{tratamento}} em {{data}}. Sentimos sua falta — se precisar de algo ou quiser reagendar, é só responder por aqui. Com carinho.')
ON CONFLICT (codigo_template) DO NOTHING;