-- L-01 — Flag governada para confirmação imediata de entrevista (EVT-08).
INSERT INTO public.regras_operacionais (chave, descricao, valor, ativo)
VALUES (
  'entrevista_confirmacao_agendamento_ativa',
  'Se verdadeiro, envia uma mensagem imediata de "entrevista agendada" ao criar a entrevista. Não afeta o lembrete de 24h. Padrão: verdadeiro (comportamento atual).',
  'true'::jsonb,
  true
)
ON CONFLICT (chave) DO NOTHING;

UPDATE public.regras_operacionais SET
  tipo = 'booleano',
  nome_amigavel = 'Confirmação imediata de agendamento (entrevistas)',
  impacto = 'Desligar esta flag suprime a mensagem imediata de "entrevista agendada" enviada no momento do agendamento, mantendo apenas o lembrete de 24h antes. Ligar (padrão) preserva o comportamento atual da casa.',
  valor_padrao = 'true',
  sensivel = true,
  confirmacao_reforcada = true,
  governavel = true
WHERE chave = 'entrevista_confirmacao_agendamento_ativa';

CREATE OR REPLACE FUNCTION public.fn_confirmacao_entrevista_ativa()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (valor::text = 'true')
       FROM regras_operacionais
      WHERE chave = 'entrevista_confirmacao_agendamento_ativa' AND ativo = true),
    true
  )
$$;

CREATE OR REPLACE FUNCTION public.fn_notif_entrevista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text;
  v_skip boolean := COALESCE(current_setting('app.excecao_ctx', true), '') = '1';
BEGIN
  SELECT nome INTO v_nome FROM assistidos WHERE id = NEW.assistido_id;

  IF TG_OP = 'INSERT' THEN
    IF fn_confirmacao_entrevista_ativa() THEN
      PERFORM fn_enqueue_notificacao('entrevista_criada', NEW.assistido_id, 'entrevista_agendada',
        jsonb_build_object('nome', v_nome, 'data', NEW.data),
        now(), 'entrevista_criada:'||NEW.id);
    END IF;
    PERFORM fn_enqueue_notificacao('entrevista_lembrete', NEW.assistido_id, 'entrevista_lembrete',
      jsonb_build_object('nome', v_nome, 'data', NEW.data),
      NEW.data - interval '24 hours', 'entrevista_lembrete:'||NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
      IF NOT v_skip THEN
        PERFORM fn_enqueue_notificacao('cancelamento', NEW.assistido_id, 'cancelamento',
          jsonb_build_object('nome', v_nome, 'tipo','entrevista','data', NEW.data),
          now(), 'entrevista_cancel:'||NEW.id);
      END IF;
    ELSIF NEW.data <> OLD.data THEN
      IF NOT v_skip THEN
        PERFORM fn_enqueue_notificacao('remarcacao', NEW.assistido_id, 'remarcacao',
          jsonb_build_object('nome', v_nome, 'tipo','entrevista','data', NEW.data,'data_anterior', OLD.data),
          now(), 'entrevista_remarca:'||NEW.id||':'||extract(epoch from NEW.data)::bigint);
      END IF;
      UPDATE notificacoes_fila
        SET status = 'cancelado', erro = 'entrevista_remarcada_por_excecao', updated_at = now()
        WHERE status IN ('pendente','agendado')
          AND evento_origem = 'entrevista_lembrete'
          AND split_part(dedupe_key, ':', 2) = NEW.id::text
          AND COALESCE(split_part(dedupe_key, ':', 3),'') <> extract(epoch from NEW.data)::bigint::text;
      PERFORM fn_enqueue_notificacao('entrevista_lembrete', NEW.assistido_id, 'entrevista_lembrete',
        jsonb_build_object('nome', v_nome, 'data', NEW.data),
        NEW.data - interval '24 hours', 'entrevista_lembrete:'||NEW.id||':'||extract(epoch from NEW.data)::bigint);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.fn_confirmacao_entrevista_ativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_confirmacao_entrevista_ativa() TO authenticated, service_role;