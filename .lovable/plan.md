## Plano de Implementação

### 1. Migração de Banco de Dados
- Adicionar `coordenador_de_tratamento` ao enum `app_role`
- Adicionar coluna `coordenador_responsavel_id` na tabela `tipos_tratamento`
- Adicionar coluna `agendado_por` (nullable) na tabela `assistido_tratamentos` para rastrear quem agendou
- Adicionar status `aguardando_agendamento` como valor válido em `assistido_tratamentos`
- Criar políticas RLS para o coordenador:
  - SELECT em `assistido_tratamentos`, `agenda_tratamentos_assistido`, `assistidos` — apenas dos tratamentos sob sua coordenação
  - UPDATE em `assistido_tratamentos` — para agendar
  - INSERT em `agenda_tratamentos_assistido` — para gerar agenda

### 2. Atualizar Tela de Tratamentos (`Tratamentos.tsx`)
- Adicionar campo "Coordenador Responsável" no formulário de cadastro/edição de tratamento
- Select com lista de usuários que tenham role `coordenador_de_tratamento`

### 3. Atualizar Tela Fazer Entrevista (`FazerEntrevista.tsx`)
- Para tratamentos `agendado_por_data_inicial`: tornar data inicial **opcional** (não obrigatória)
- Se data em branco → salvar com status `aguardando_agendamento` e não gerar agenda
- Exibir mensagem informativa: "Sem data → lista de espera do coordenador"

### 4. Criar Dashboard do Coordenador
- Nova página `CoordenadorDashboard.tsx` com 3 abas:
  - **Lista de Espera**: assistidos aguardando agendamento, ordenados por data/hora da entrevista
  - **Em Andamento**: assistidos com tratamento ativo
  - **Agenda**: próximas sessões dos tratamentos coordenados
- Ação "Agendar" na lista de espera: campo de data + validação de dia da semana + geração automática de agenda

### 5. Atualizar Navegação e Rotas
- Adicionar rotas para o coordenador no `App.tsx`
- Adicionar itens de menu no `AppSidebar.tsx`
- Atualizar `Dashboard.tsx` para renderizar dashboard do coordenador
- Atualizar `ProtectedRoute` se necessário

### 6. Atualizar AuthContext
- Incluir `coordenador_de_tratamento` no type `AppRole`

### Ordem de execução:
1. Migração DB (precisa aprovação)
2. Código (após migração aprovada)
