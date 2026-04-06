
# Fase 4 — Inteligência, Automação e Governança

## Entrega em 3 blocos para manter qualidade e não quebrar nada:

---

### Bloco A — Fundação (Banco + Regras + Auditoria)

1. **Motor de Regras Avançadas**
   - Tabela `regras_operacionais` com chave, valor, descrição, ativo/inativo
   - Tela de configuração para admin (limite de faltas, prazo máximo em espera, etc.)
   - Regras consultáveis por todo o sistema

2. **Auditoria Avançada**
   - Triggers no banco para registrar automaticamente alterações em: entrevistas, assistido_tratamentos, agenda_tratamentos_assistido, presencas_tratamentos
   - Dados: quem, quando, valor anterior, valor novo
   - Tela de auditoria já existente será aprimorada com filtros e detalhes

3. **Alertas Automáticos Operacionais**
   - Edge function scheduled (cron) que verifica condições como:
     - Faltas recorrentes (baseado na regra configurada)
     - Tratamento sem agenda
     - Itens antigos na lista de espera
     - Entrevista sem tratamento
     - Carga alta por tarefeiro
   - Gera avisos na tabela `avisos_internos` para os perfis corretos

---

### Bloco B — Experiência Operacional

4. **Priorização da Lista de Espera**
   - Adicionar campo `prioridade` e `urgencia` em `assistido_tratamentos`
   - Coordenador pode definir prioridade ao visualizar a fila
   - Lista de espera com ordenação por prioridade + tempo na fila
   - Destaque visual para itens críticos

5. **Painel de Exceções e Pendências**
   - Nova página/aba para admin e coordenador
   - Cards com contadores: tratamentos sem agenda, sessões sem presença, entrevistas sem desdobramento, assistidos com muitas faltas
   - Cada card permite drill-down com filtros

6. **Push Notifications Internas**
   - Usar a tabela `avisos_internos` existente + Supabase Realtime
   - Toast/notification em tempo real quando chega novo aviso
   - Badge no ícone de notificação atualizado em tempo real
   - Tipos: próxima sessão, sessão alterada, tratamento concluído

---

### Bloco C — Inteligência

7. **Assistente da Entrevista Fraterna**
   - Botão "Assistente IA" na tela de entrevista
   - Usa Lovable AI (Gemini) para:
     - Resumir observações da entrevista
     - Destacar queixas, dores, pontos de atenção
     - Sugerir tratamentos disponíveis no sistema
     - Sugerir quantidade de sessões
   - Resultado é sugestão editável, nunca automático
   - Registro de quem validou a sugestão

---

## Ordem de implementação sugerida:
1. Bloco A (fundação) → aprovação → implementação
2. Bloco B (experiência) → aprovação → implementação  
3. Bloco C (IA) → aprovação → implementação

Deseja aprovar o plano e começar pelo Bloco A?
