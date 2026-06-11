
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.notif_status AS ENUM ('pendente','agendado','enviado','falha','cancelado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.notif_canal AS ENUM ('whatsapp');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.notif_evento AS ENUM (
    'entrevista_criada','entrevista_lembrete','sessao_criada','sessao_lembrete','remarcacao','cancelamento'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.conversa_status AS ENUM ('ativa','encerrada');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.handoff_status AS ENUM ('aberto','em_atendimento','fechado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============ HELPER: normalizar telefone (digits only) ============
CREATE OR REPLACE FUNCTION public.fn_normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(regexp_replace(COALESCE(p,''), '\D', '', 'g'), '');
$$;

-- ============ TABLE: notificacoes_preferencias ============
CREATE TABLE public.notificacoes_preferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id uuid NOT NULL UNIQUE REFERENCES public.assistidos(id) ON DELETE CASCADE,
  whatsapp_ativo boolean NOT NULL DEFAULT true,
  opt_out_at timestamptz,
  opt_out_motivo text,
  horario_inicio_envio time NOT NULL DEFAULT '08:00',
  horario_fim_envio time NOT NULL DEFAULT '20:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes_preferencias TO authenticated;
GRANT ALL ON public.notificacoes_preferencias TO service_role;
ALTER TABLE public.notificacoes_preferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assistido manages own notif prefs" ON public.notificacoes_preferencias
  FOR ALL TO authenticated
  USING (assistido_id IN (SELECT id FROM public.assistidos WHERE user_id = auth.uid()))
  WITH CHECK (assistido_id IN (SELECT id FROM public.assistidos WHERE user_id = auth.uid()));
CREATE POLICY "Staff manage notif prefs" ON public.notificacoes_preferencias
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'));

CREATE TRIGGER trg_notif_prefs_updated BEFORE UPDATE ON public.notificacoes_preferencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TABLE: notificacoes_templates ============
CREATE TABLE public.notificacoes_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_template text NOT NULL UNIQUE,
  tipo_evento public.notif_evento NOT NULL,
  canal public.notif_canal NOT NULL DEFAULT 'whatsapp',
  titulo_interno text NOT NULL,
  corpo_template text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes_templates TO authenticated;
GRANT ALL ON public.notificacoes_templates TO service_role;
ALTER TABLE public.notificacoes_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage templates" ON public.notificacoes_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'));

CREATE TRIGGER trg_notif_tpl_updated BEFORE UPDATE ON public.notificacoes_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TABLE: notificacoes_fila ============
CREATE TABLE public.notificacoes_fila (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_origem public.notif_evento NOT NULL,
  assistido_id uuid REFERENCES public.assistidos(id) ON DELETE CASCADE,
  telefone_normalizado text,
  canal public.notif_canal NOT NULL DEFAULT 'whatsapp',
  template_codigo text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.notif_status NOT NULL DEFAULT 'pendente',
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  dedupe_key text NOT NULL UNIQUE,
  external_message_id text,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_fila_status_sched ON public.notificacoes_fila(status, scheduled_at);
CREATE INDEX idx_notif_fila_assistido ON public.notificacoes_fila(assistido_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes_fila TO authenticated;
GRANT ALL ON public.notificacoes_fila TO service_role;
ALTER TABLE public.notificacoes_fila ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read fila" ON public.notificacoes_fila
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'));
CREATE POLICY "Staff update fila" ON public.notificacoes_fila
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'));

CREATE TRIGGER trg_notif_fila_updated BEFORE UPDATE ON public.notificacoes_fila
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TABLE: notificacoes_log ============
CREATE TABLE public.notificacoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fila_id uuid REFERENCES public.notificacoes_fila(id) ON DELETE CASCADE,
  direcao text NOT NULL CHECK (direcao IN ('saida','entrada')),
  payload_enviado jsonb,
  payload_recebido jsonb,
  status text,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_log_fila ON public.notificacoes_log(fila_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes_log TO authenticated;
GRANT ALL ON public.notificacoes_log TO service_role;
ALTER TABLE public.notificacoes_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read logs" ON public.notificacoes_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'));

-- ============ TABLE: whatsapp_conversas ============
CREATE TABLE public.whatsapp_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistido_id uuid REFERENCES public.assistidos(id) ON DELETE SET NULL,
  telefone text NOT NULL,
  status_conversa public.conversa_status NOT NULL DEFAULT 'ativa',
  ultimo_contato_em timestamptz NOT NULL DEFAULT now(),
  em_handoff boolean NOT NULL DEFAULT false,
  atendente_responsavel uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_wa_conversa_telefone ON public.whatsapp_conversas(telefone);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversas TO authenticated;
GRANT ALL ON public.whatsapp_conversas TO service_role;
ALTER TABLE public.whatsapp_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage conversas" ON public.whatsapp_conversas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'));

CREATE TRIGGER trg_wa_conversa_updated BEFORE UPDATE ON public.whatsapp_conversas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TABLE: whatsapp_handoffs ============
CREATE TABLE public.whatsapp_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  motivo text,
  classificado_por_ia boolean NOT NULL DEFAULT false,
  status public.handoff_status NOT NULL DEFAULT 'aberto',
  atendente_id uuid REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_handoff_status ON public.whatsapp_handoffs(status);
CREATE INDEX idx_wa_handoff_conversa ON public.whatsapp_handoffs(conversa_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_handoffs TO authenticated;
GRANT ALL ON public.whatsapp_handoffs TO service_role;
ALTER TABLE public.whatsapp_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage handoffs" ON public.whatsapp_handoffs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador_de_tratamento'));

CREATE TRIGGER trg_wa_handoff_updated BEFORE UPDATE ON public.whatsapp_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ENQUEUE HELPER ============
CREATE OR REPLACE FUNCTION public.fn_enqueue_notificacao(
  p_evento public.notif_evento,
  p_assistido_id uuid,
  p_template text,
  p_payload jsonb,
  p_scheduled_at timestamptz,
  p_dedupe_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text;
  v_status public.notif_status;
BEGIN
  SELECT fn_normalize_phone(COALESCE(celular, telefone)) INTO v_phone
  FROM assistidos WHERE id = p_assistido_id;

  v_status := CASE WHEN p_scheduled_at > now() THEN 'agendado'::public.notif_status
                   ELSE 'pendente'::public.notif_status END;

  INSERT INTO notificacoes_fila (
    evento_origem, assistido_id, telefone_normalizado, canal,
    template_codigo, payload_json, status, scheduled_at, dedupe_key
  ) VALUES (
    p_evento, p_assistido_id, v_phone, 'whatsapp',
    p_template, COALESCE(p_payload,'{}'::jsonb), v_status, p_scheduled_at, p_dedupe_key
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END $$;

-- ============ TRIGGER: entrevistas ============
CREATE OR REPLACE FUNCTION public.fn_notif_entrevista()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome text;
BEGIN
  SELECT nome INTO v_nome FROM assistidos WHERE id = NEW.assistido_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM fn_enqueue_notificacao('entrevista_criada', NEW.assistido_id, 'entrevista_agendada',
      jsonb_build_object('nome', v_nome, 'data', NEW.data),
      now(), 'entrevista_criada:'||NEW.id);
    PERFORM fn_enqueue_notificacao('entrevista_lembrete', NEW.assistido_id, 'entrevista_lembrete',
      jsonb_build_object('nome', v_nome, 'data', NEW.data),
      NEW.data - interval '24 hours', 'entrevista_lembrete:'||NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
      PERFORM fn_enqueue_notificacao('cancelamento', NEW.assistido_id, 'cancelamento',
        jsonb_build_object('nome', v_nome, 'tipo','entrevista','data', NEW.data),
        now(), 'entrevista_cancel:'||NEW.id);
    ELSIF NEW.data <> OLD.data THEN
      PERFORM fn_enqueue_notificacao('remarcacao', NEW.assistido_id, 'remarcacao',
        jsonb_build_object('nome', v_nome, 'tipo','entrevista','data', NEW.data,'data_anterior', OLD.data),
        now(), 'entrevista_remarca:'||NEW.id||':'||extract(epoch from NEW.data)::bigint);
      PERFORM fn_enqueue_notificacao('entrevista_lembrete', NEW.assistido_id, 'entrevista_lembrete',
        jsonb_build_object('nome', v_nome, 'data', NEW.data),
        NEW.data - interval '24 hours', 'entrevista_lembrete:'||NEW.id||':'||extract(epoch from NEW.data)::bigint);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notif_entrevista
  AFTER INSERT OR UPDATE ON public.entrevistas_fraternas
  FOR EACH ROW EXECUTE FUNCTION public.fn_notif_entrevista();

-- ============ TRIGGER: agenda de sessoes ============
CREATE OR REPLACE FUNCTION public.fn_notif_sessao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome text;
  v_trat text;
  v_when timestamptz;
BEGIN
  SELECT nome INTO v_nome FROM assistidos WHERE id = COALESCE(NEW.assistido_id, OLD.assistido_id);

  IF TG_OP = 'INSERT' THEN
    SELECT nome INTO v_trat FROM tipos_tratamento WHERE id = NEW.tratamento_id;
    v_when := (NEW.data_sessao::timestamp + COALESCE(NEW.horario, '08:00'::time));
    PERFORM fn_enqueue_notificacao('sessao_criada', NEW.assistido_id, 'sessao_agendada',
      jsonb_build_object('nome', v_nome, 'tratamento', v_trat, 'data', NEW.data_sessao, 'horario', NEW.horario),
      now(), 'sessao_criada:'||NEW.id);
    PERFORM fn_enqueue_notificacao('sessao_lembrete', NEW.assistido_id, 'sessao_lembrete',
      jsonb_build_object('nome', v_nome, 'tratamento', v_trat, 'data', NEW.data_sessao, 'horario', NEW.horario),
      v_when - interval '24 hours', 'sessao_lembrete:'||NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT nome INTO v_trat FROM tipos_tratamento WHERE id = NEW.tratamento_id;
    IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
      PERFORM fn_enqueue_notificacao('cancelamento', NEW.assistido_id, 'cancelamento',
        jsonb_build_object('nome', v_nome, 'tipo','sessao','tratamento', v_trat, 'data', NEW.data_sessao),
        now(), 'sessao_cancel:'||NEW.id);
    ELSIF NEW.data_sessao <> OLD.data_sessao OR COALESCE(NEW.horario,'00:00') <> COALESCE(OLD.horario,'00:00') THEN
      v_when := (NEW.data_sessao::timestamp + COALESCE(NEW.horario, '08:00'::time));
      PERFORM fn_enqueue_notificacao('remarcacao', NEW.assistido_id, 'remarcacao',
        jsonb_build_object('nome', v_nome, 'tipo','sessao','tratamento', v_trat, 'data', NEW.data_sessao, 'horario', NEW.horario, 'data_anterior', OLD.data_sessao),
        now(), 'sessao_remarca:'||NEW.id||':'||NEW.data_sessao::text||':'||COALESCE(NEW.horario::text,''));
      PERFORM fn_enqueue_notificacao('sessao_lembrete', NEW.assistido_id, 'sessao_lembrete',
        jsonb_build_object('nome', v_nome, 'tratamento', v_trat, 'data', NEW.data_sessao, 'horario', NEW.horario),
        v_when - interval '24 hours', 'sessao_lembrete:'||NEW.id||':'||NEW.data_sessao::text);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notif_sessao
  AFTER INSERT OR UPDATE ON public.agenda_tratamentos_assistido
  FOR EACH ROW EXECUTE FUNCTION public.fn_notif_sessao();

-- ============ SEED TEMPLATES ============
INSERT INTO public.notificacoes_templates (codigo_template, tipo_evento, canal, titulo_interno, corpo_template) VALUES
('entrevista_agendada','entrevista_criada','whatsapp','Entrevista agendada',
 'Olá, {{nome}}! 🌿 Sua entrevista foi agendada para {{data}}. Será uma alegria receber você. Qualquer dúvida, é só responder por aqui.'),
('entrevista_lembrete','entrevista_lembrete','whatsapp','Lembrete de entrevista (24h)',
 'Olá, {{nome}}! 🌿 Passando para lembrar da sua entrevista amanhã, {{data}}. Esperamos por você com carinho.'),
('sessao_agendada','sessao_criada','whatsapp','Sessão agendada',
 'Olá, {{nome}}! 🌿 Sua sessão de {{tratamento}} foi agendada para {{data}} às {{horario}}. Estamos à disposição.'),
('sessao_lembrete','sessao_lembrete','whatsapp','Lembrete de sessão (24h)',
 'Olá, {{nome}}! 🌿 Lembrete da sua sessão de {{tratamento}} amanhã, {{data}} às {{horario}}. Até breve!'),
('remarcacao','remarcacao','whatsapp','Remarcação',
 'Olá, {{nome}}! 🌿 Houve uma atualização: seu {{tipo}} foi remarcado para {{data}}. Qualquer dúvida, responda por aqui.'),
('cancelamento','cancelamento','whatsapp','Cancelamento',
 'Olá, {{nome}}! 🌿 Informamos que seu {{tipo}} de {{data}} foi cancelado. Se precisar reagendar, estamos à disposição.')
ON CONFLICT (codigo_template) DO NOTHING;
