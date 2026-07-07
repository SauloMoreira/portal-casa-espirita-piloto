-- Q2-C3-A — Correção controlada do catálogo de templates (idempotente).
-- Cria as chaves de template enfileiradas pelo código mas ausentes no catálogo,
-- causa raiz do erro `template_indisponivel` diagnosticado no Q2-C2.
--
-- Payloads reais (fluxo de falta com suspensão/remarcação — fn de falta):
--   tratamento_suspenso            -> { nome, tratamento }        evento: falta_registrada
--   tratamento_ausencia_remarcada  -> { nome, tratamento, nova_data } evento: falta_registrada
--
-- Idempotência: ON CONFLICT DO NOTHING preserva conteúdo já existente e não
-- duplica em reexecução. NÃO toca em item algum da fila.

INSERT INTO public.notificacoes_templates
  (codigo_template, tipo_evento, canal, titulo_interno, corpo_template, ativo)
VALUES
  (
    'tratamento_suspenso',
    'falta_registrada'::notif_evento,
    'whatsapp'::notif_canal,
    'Tratamento suspenso',
    'Olá, {{nome}}! 🌿 Informamos que sua sessão de {{tratamento}} foi suspensa. Assim que houver novidade, avisaremos por aqui. Qualquer dúvida, é só responder.',
    true
  ),
  (
    'tratamento_ausencia_remarcada',
    'falta_registrada'::notif_evento,
    'whatsapp'::notif_canal,
    'Ausência remarcada',
    'Olá, {{nome}}! 🌿 Notamos sua ausência na sessão de {{tratamento}}. Já reservamos uma nova data para você: {{nova_data}}. Se precisar de algo, é só responder por aqui. Com carinho.',
    true
  )
ON CONFLICT (codigo_template) DO NOTHING;