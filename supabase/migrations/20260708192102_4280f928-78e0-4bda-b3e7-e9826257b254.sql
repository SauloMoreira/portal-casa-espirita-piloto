
-- SAAS-06-B0.2 — Alinhar catálogo comercial de módulos
-- 1) Renomear módulos existentes para refletir visão comercial oficial
UPDATE public.modulos
   SET nome = 'Caixa / Cantina',
       descricao = 'Controle de caixa e cantina da casa (futuro módulo)'
 WHERE codigo = 'caixa';

UPDATE public.modulos
   SET nome = 'Portal Institucional',
       descricao = 'Site institucional da casa espírita (futuro módulo)'
 WHERE codigo = 'portal';

UPDATE public.modulos
   SET nome = 'Tratamentos',
       descricao = 'Gestão completa de assistidos, entrevistas, agenda, presença, voluntários, palestras, sessões públicas, comunicação operacional, relatórios e IA de apoio'
 WHERE codigo = 'tratamentos';

UPDATE public.modulos
   SET nome = 'Biblioteca',
       descricao = 'Acervo bibliográfico da casa (futuro módulo)'
 WHERE codigo = 'biblioteca';

-- 2) Adicionar módulo Financeiro (futuro)
INSERT INTO public.modulos (codigo, nome, descricao, ativo)
VALUES ('financeiro', 'Financeiro', 'Gestão financeira da casa (futuro módulo)', true)
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao;

-- 3) Adicionar plano Produção Assistida (só Tratamentos)
INSERT INTO public.planos (codigo, nome, descricao)
VALUES ('producao_assistida', 'Produção Assistida', 'Plano para casas em produção assistida / piloto — apenas módulo Tratamentos')
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao;

-- 4) Composição do plano Produção Assistida = apenas Tratamentos
INSERT INTO public.plano_modulos (plano_id, modulo_id, ativo)
SELECT p.id, m.id, true
  FROM public.planos p
  CROSS JOIN public.modulos m
 WHERE p.codigo = 'producao_assistida'
   AND m.codigo = 'tratamentos'
ON CONFLICT (plano_id, modulo_id) DO UPDATE SET ativo = true;

-- 5) Adicionar Financeiro aos planos completo/enterprise (visão futura)
INSERT INTO public.plano_modulos (plano_id, modulo_id, ativo)
SELECT p.id, m.id, true
  FROM public.planos p
  CROSS JOIN public.modulos m
 WHERE m.codigo = 'financeiro'
   AND p.codigo IN ('completo', 'enterprise')
ON CONFLICT (plano_id, modulo_id) DO UPDATE SET ativo = true;
