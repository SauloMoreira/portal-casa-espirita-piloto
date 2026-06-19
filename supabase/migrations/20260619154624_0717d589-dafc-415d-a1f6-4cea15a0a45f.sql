-- ============================================================
-- Módulo 5A: Comunicação institucional (área administrativa)
-- ============================================================
CREATE TABLE public.comunicacoes_institucionais (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'comunicado',
  mensagem text NOT NULL,
  campanha_id uuid REFERENCES public.campanhas(id) ON DELETE SET NULL,
  evento_id uuid REFERENCES public.eventos(id) ON DELETE SET NULL,
  publico_criterio text NOT NULL DEFAULT 'consentidos',
  publico_estimado integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho',
  revisado_at timestamptz,
  revisado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comunicacoes_institucionais TO authenticated;
GRANT ALL ON public.comunicacoes_institucionais TO service_role;

ALTER TABLE public.comunicacoes_institucionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam comunicacoes (select)"
  ON public.comunicacoes_institucionais FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins gerenciam comunicacoes (insert)"
  ON public.comunicacoes_institucionais FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins gerenciam comunicacoes (update)"
  ON public.comunicacoes_institucionais FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins gerenciam comunicacoes (delete)"
  ON public.comunicacoes_institucionais FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_comunicacoes_institucionais_updated_at
  BEFORE UPDATE ON public.comunicacoes_institucionais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER stamp_actor_comunicacoes_institucionais
  BEFORE INSERT OR UPDATE ON public.comunicacoes_institucionais
  FOR EACH ROW EXECUTE FUNCTION public.fn_stamp_actor();

CREATE TRIGGER audit_comunicacoes_institucionais
  AFTER INSERT OR UPDATE OR DELETE ON public.comunicacoes_institucionais
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE INDEX idx_comunicacoes_institucionais_status ON public.comunicacoes_institucionais (status, created_at DESC);

-- Conta o público elegível para comunicação institucional, respeitando o
-- consentimento de WhatsApp na versão vigente do termo. Apenas admin.
CREATE OR REPLACE FUNCTION public.contar_publico_elegivel(p_versao text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'nao autorizado';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.assistidos a
  JOIN public.notificacoes_preferencias p ON p.assistido_id = a.id
  WHERE a.deleted_at IS NULL
    AND COALESCE(NULLIF(a.celular, ''), NULLIF(a.telefone, '')) IS NOT NULL
    AND p.whatsapp_ativo = true
    AND p.consentimento_status = 'concedido'
    AND p.consentimento_versao = p_versao;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.contar_publico_elegivel(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contar_publico_elegivel(text) TO authenticated;