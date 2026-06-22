UPDATE public.notificacoes_templates
SET corpo_template = 'Olá, {{nome}}! 🌿 Lembrete da sua sessão de {{tratamento}} {{quando}} às {{horario}}. Até breve!'
WHERE codigo_template = 'sessao_lembrete';