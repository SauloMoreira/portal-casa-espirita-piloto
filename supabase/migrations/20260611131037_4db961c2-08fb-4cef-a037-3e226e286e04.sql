-- Índices de performance/escalabilidade (sem alterar dados ou regras de negócio)

CREATE INDEX IF NOT EXISTS idx_presencas_trat_vinculo ON public.presencas_tratamentos (assistido_tratamento_id);
CREATE INDEX IF NOT EXISTS idx_presencas_trat_vinculo_data ON public.presencas_tratamentos (assistido_tratamento_id, data);
CREATE INDEX IF NOT EXISTS idx_presencas_trat_status ON public.presencas_tratamentos (status_presenca);

CREATE INDEX IF NOT EXISTS idx_entrevistas_data_status ON public.entrevistas_fraternas (data, status);
CREATE INDEX IF NOT EXISTS idx_entrevistas_entrevistador ON public.entrevistas_fraternas (entrevistador_id);

CREATE INDEX IF NOT EXISTS idx_assistido_tratamentos_entrevista ON public.assistido_tratamentos (entrevista_id);
CREATE INDEX IF NOT EXISTS idx_assistido_tratamentos_tratamento ON public.assistido_tratamentos (tratamento_id);

CREATE INDEX IF NOT EXISTS idx_checkins_sessao ON public.checkins_publicos (sessao_id);
CREATE INDEX IF NOT EXISTS idx_checkins_created_at ON public.checkins_publicos (created_at);

CREATE INDEX IF NOT EXISTS idx_sessoes_publicas_data ON public.sessoes_publicas (data_sessao);

CREATE INDEX IF NOT EXISTS idx_voluntarios_status ON public.voluntarios (status);
CREATE INDEX IF NOT EXISTS idx_voluntarios_nome ON public.voluntarios (nome_completo);

CREATE INDEX IF NOT EXISTS idx_assistidos_nome ON public.assistidos (nome) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_ia_sugestoes_created_at ON public.ia_sugestoes (created_at);
CREATE INDEX IF NOT EXISTS idx_ia_feedback_sugestao ON public.ia_feedback (sugestao_ia_id);
CREATE INDEX IF NOT EXISTS idx_ia_queixa_tratamento_queixa ON public.ia_queixa_tratamento (queixa_id);
CREATE INDEX IF NOT EXISTS idx_ia_queixa_tratamento_tratamento ON public.ia_queixa_tratamento (tratamento_id);
CREATE INDEX IF NOT EXISTS idx_ia_biblioteca_relacoes_material ON public.ia_biblioteca_relacoes (material_id);
CREATE INDEX IF NOT EXISTS idx_ia_biblioteca_relacoes_queixa ON public.ia_biblioteca_relacoes (queixa_id);
CREATE INDEX IF NOT EXISTS idx_ia_biblioteca_relacoes_tratamento ON public.ia_biblioteca_relacoes (tratamento_id);