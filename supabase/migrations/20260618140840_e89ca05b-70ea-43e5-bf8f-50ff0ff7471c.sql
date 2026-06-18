ALTER FUNCTION public.painel_conversas(date,date,text,boolean,boolean,boolean,uuid,text,boolean,integer) VOLATILE;
ALTER FUNCTION public.painel_whatsapp_v2(date,date,text,text,uuid,text,boolean) VOLATILE;
ALTER FUNCTION public.dashboard_admin(date,date) VOLATILE;
ALTER FUNCTION public.relatorio_carga_tarefeiro(date,date,uuid,uuid,integer,integer) VOLATILE;
ALTER FUNCTION public.relatorio_tratamentos_concluidos(date,date,uuid,text,uuid,uuid,integer,integer) VOLATILE;