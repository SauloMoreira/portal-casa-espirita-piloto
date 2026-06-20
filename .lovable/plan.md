# Melhoria de Navegação, Perfil e Comunicações — Tratamentos FER

## Já aplicado (banco de dados) ✅
- Coluna `comunicacao_geral_ativa boolean NOT NULL DEFAULT true` em `notificacoes_preferencias` (tipos regenerados).
- Eventos `presenca_registrada` e `falta_registrada` no enum `notif_evento`.
- `fn_notif_presenca()` + trigger `trg_notif_presenca` em `presencas_tratamentos` (enqueue com dedupe/auditoria).
- Templates `presenca_registrada` e `falta_registrada`.

## A implementar (build mode)

### 1. `AppSidebar.tsx`
- Remover "Meu Perfil" do grupo Tratamentos (rota `/meu-perfil` permanece).
- Tornar o bloco do rodapé (avatar + nome + papel) clicável → `/meu-perfil`, com foco/hover, `aria-label`, nos estados expandido e colapsado.

### 2. `MeuPerfil.tsx`
- Mantém editáveis (celular, foto, endereço) e somente leitura (nome, e-mail, CPF, nascimento).
- Nova seção **"Preferências de Comunicação"** com flag **"Receber comunicações gerais da FER"** persistida em `comunicacao_geral_ativa`.

### 3. `notificacoesService.ts`
- `getComunicacaoGeralAtiva(assistidoId)` e `setComunicacaoGeralAtiva(assistidoId, ativa)` com upsert seguro por `assistido_id`.

### 4. `src/lib/comunicacaoCanal.ts` (+ testes)
- `classificarEvento(evento): "operacional" | "geral"` como fonte única; operacionais = entrevista/sessão/remarcação/cancelamento/presença/falta; default seguro = geral.

### 5. Edges
- `notificacoes-dispatch`: eventos operacionais não bloqueados por `comunicacao_geral_ativa` (seguem respeitando `whatsapp_ativo`, janela, dedupe, limite, retries); eventos gerais respeitam a flag.
- `comunicacao-dispatch`: bloquear quando `comunicacao_geral_ativa = false`, além do consentimento já checado.

### 6. Testes
- `vitest run`, typecheck e build limpos, sem regressão.

## Critérios de aceite
"Meu Perfil" fora de Tratamentos; bloco do usuário abre o perfil; e-mail somente leitura; flag funcionando e respeitada apenas pelas comunicações gerais; presença/falta automatizadas sem duplicidade; build/typecheck/testes ok.
