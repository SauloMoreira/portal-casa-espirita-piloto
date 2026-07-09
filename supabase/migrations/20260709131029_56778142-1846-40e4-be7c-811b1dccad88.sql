
-- FIX02: trigger functions that write to audit_logs run under owner privileges
-- to bypass audit_logs RLS while preserving user identity in the log payload.

CREATE OR REPLACE FUNCTION public.fn_solicitacao_comercial_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.fn_solicitacao_comercial_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Revoke direct execution to non-trigger callers (defense in depth).
REVOKE ALL ON FUNCTION public.fn_solicitacao_comercial_after_insert() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_solicitacao_comercial_after_update() FROM PUBLIC, anon;
