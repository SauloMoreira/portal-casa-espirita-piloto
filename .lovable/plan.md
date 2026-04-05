
## Fase 1 – Plano de Implementação

### Etapa 1: Ajustes no banco de dados
- Adicionar coluna `tarefeiro_id` na tabela `tipos_tratamento` (vincular tratamento ao tarefeiro responsável)
- Adicionar coluna `quantidade_palestras` na tabela `assistidos` (contagem de palestras assistidas)
- Criar trigger para calcular `quantidade_faltante` automaticamente
- Criar trigger para atualizar status do `assistido_tratamentos` ao atingir total de sessões

### Etapa 2: Tela de recuperação de senha
- Criar página `/forgot-password` e `/reset-password`

### Etapa 3: Gestão de Usuários (Admin)
- CRUD completo: listar, criar, editar, ativar/inativar usuários
- Atribuição de perfil (admin, entrevistador, tarefeiro, assistido)

### Etapa 4: Cadastro de Tratamentos (Admin)
- CRUD completo com formulário: nome, tipo, descrição, dia da semana, horário, frequência, tarefeiro responsável, status
- Filtros por nome, tipo e status
- Inativação em vez de exclusão

### Etapa 5: Cadastro de Assistidos (Admin/Entrevistador)
- CRUD completo: nome, data de nascimento, telefone, e-mail, endereço, observações, status
- Exibir quantidade de palestras e aptidão para entrevista
- Filtros por nome, telefone e status

### Etapa 6: Configuração de Palestras Mínimas (Admin)
- Tela de configuração com campo parametrizável
- Toggle para permitir entrevista fraterna livre

### Etapa 7: Registro de Palestras e Presenças em Palestras
- Registrar palestras e marcar presença dos assistidos
- Contagem automática para regra de aptidão

### Etapa 8: Agenda de Entrevistas Fraternas
- Agendar, remarcar, cancelar entrevistas
- Validar regra de palestras mínimas (regular vs livre)
- Filtros por data, entrevistador e status

### Etapa 9: Entrevista com Designação de Tratamentos
- Formulário de entrevista: dados do assistido, observações, decisões
- Designar múltiplos tratamentos com quantidade de sessões
- Criar vínculos `assistido_tratamentos` ao salvar

### Etapa 10: Tela do Tarefeiro – Presença
- Lista de tratamentos do dia do tarefeiro logado
- Lista de assistidos por tratamento
- Botões para marcar presença/ausência
- Atualização automática de sessões realizadas/faltantes

### Etapa 11: Tela do Assistido
- Dashboard: tratamentos ativos, sessões realizadas/faltantes, próximas datas
- Entrevistas agendadas
- Interface acolhedora e simples

### Etapa 12: Dashboards simplificados por perfil
- Admin: totais básicos (assistidos, entrevistas, tratamentos ativos)
- Entrevistador: entrevistas do dia e pendentes
- Tarefeiro: tratamentos do dia
- Assistido: próximos atendimentos e progresso
