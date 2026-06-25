# Achados de Validação Manual

> Documento **vivo** e oficial. Canal único para registrar bugs e melhorias
> encontrados em **testes manuais** da operação real, evitando que se percam em
> conversa solta. Todo achado relevante deve ser: **classificado → registrado →
> priorizado → encaminhado** (para `docs/BACKLOG-GOVERNANCA.md` e/ou correção).

## Como registrar um achado

1. Adicione uma linha na tabela abaixo com um ID sequencial `AVM-NNN`.
2. Classifique: `Bug` | `Melhoria` | `Dúvida/risco`.
3. Defina severidade: `Crítica` | `Alta` | `Média` | `Baixa`.
4. Aponte a invariante relacionada (se houver) — `INV-*`.
5. Defina o encaminhamento: corrigir agora, virar item de backlog (`L-NN`) ou
   observar.
6. Quando um bug for corrigido, garanta que ele vire **teste de regressão
   permanente** em `src/test/governanca/regressao-bugs-historicos.test.ts` e marque
   o status como ✅.

## Classificação rápida (guia)

- **Bug crítico** → corrigir agora + regressão obrigatória.
- **Bug não crítico** → backlog priorizado + regressão quando corrigido.
- **Melhoria** → backlog (`L-NN`), priorizada conforme impacto operacional.
- **Dúvida/risco** → investigar; vira invariante nova se confirmar regra estrutural.

## Registro

| ID | Data | Classe | Severidade | Descrição | INV relacionada | Encaminhamento | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AVM-001 | 2026-06-25 | Bug | Crítica | Registrar presença `presente`/`ausente` falhava em runtime: `fn_notif_presenca` passava `v_evento` (text) para `fn_enqueue_notificacao`, cujo 1º parâmetro é o enum `notif_evento` (sem cast implícito text→enum). Regressão do refactor L-03, invisível à suíte de espelho. Detectado pela integração real L-07. | INV-PRES-003, INV-ARQ-001 | Corrigido por migração (`v_evento::notif_evento`); travado por `src/test/integration/db/auditoria.dbtest.ts`. | ✅ |
| BUG-03 | 2026-06-25 | Bug | Crítica | Perfil `tarefeiro` visualizava conteúdo sigiloso da entrevista fraterna (`observacoes`/`decisoes`): a política RLS "Tarefeiros read entrevistas" liberava todas as colunas, e Agenda/Entrevistas/Carta faziam `select` desses campos. Falha de LGPD/sigilo fraterno/menor privilégio. | INV-SEG-004 (nova), INV-ARQ-001 | Backend: removida a política de SELECT do tarefeiro + RPC `fn_entrevistas_operacional` (projeção sem campos sigilosos). Frontend: agenda/listagem/carta passam pela RPC; "Ver" da entrevista realizada e busca de conteúdo restritos a admin/entrevistador. Travado por `src/test/governanca/privacidade-entrevista-tarefeiro.test.ts` (5) e `src/test/integration/db/privacidade-entrevista.dbtest.ts` (4). | ✅ |

> **Observação:** esta seção foi criada como o mecanismo oficial pedido na frente de
> "Testes de Invariantes e Contratos". Cole aqui os achados dos testes manuais que
> você realizou; cada um será classificado, priorizado e encaminhado a partir desta
> tabela. Bugs confirmados como importantes devem virar regressão permanente.
