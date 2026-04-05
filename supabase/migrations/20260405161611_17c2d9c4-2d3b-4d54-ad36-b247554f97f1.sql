
ALTER TABLE public.assistidos DROP CONSTRAINT assistidos_status_check;
ALTER TABLE public.assistidos ADD CONSTRAINT assistidos_status_check CHECK (status = ANY (ARRAY['ativo','inativo','suspenso','aguardando_palestras','apto_para_entrevista','entrevista_agendada','entrevistado','em_tratamento','concluido']));
