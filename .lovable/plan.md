## Objetivo
Adicionar **alerta externo por WhatsApp pessoal** aos Comunicadores quando houver conversas humanas pendentes na fila da Central, reaproveitando a arquitetura existente (handoff, claim seguro, Z-API/channel-adapter, auditoria, cron `alertas-operacionais`). Sem fila paralela, sem spam, com cooldown, consolidação, governança, idempotência e controle de concorrência.

## Princípios
Não criar fila paralela. Alerta nunca concede claim/posse. Sem spam/duplicidade. Sem conteúdo sensível no alerta. Não quebrar handoff/claim/IA/Central estáveis. Rastreabilidade total. Baixo risco de regressão.

## Fonte oficial da fila humana
Verdade = **`whatsapp_handoffs`**. Pendente para alerta **somente** quando `status = 'aberto'` **E** `atendente_id IS NULL`. `whatsapp_conversas` só como apoio/contexto, sem disputar como fonte principal.

## Base já existente
Claim seguro (`assumirConversa`/`assumirHandoff`); envio via channel-adapter/Z-API; cron com `guardCronOrStaff` + `x-cron-secret`; auditoria via `audit_logs`; `fn_normalize_phone(text)`. O alerta apenas chama o Comunicador — nunca assume conversa, altera posse ou cria claim implícito.

## 1. Elegibilidade (vínculo por telefone, sem CPF)
Elegível quando, simultaneamente:
- função de voluntário **Comunicador**, voluntário `status = 'ativo'`;
- vínculo **único e confiável** por telefone: `fn_normalize_phone(voluntarios.celular) = fn_normalize_phone(profiles.celular)`;
- `profiles.celular` válido;
- opt-in ativo (`recebe_alertas_central = true`) e `ativo = true`.

Não elegível se: múltiplos matches, ambiguidade, ausência de vínculo confiável, telefone inválido, ou telefone duplicado entre perfis elegíveis. Sem CPF, sem heurísticas fracas. Número usado = sempre `profiles.celular` (pessoal); nunca institucional/genérico/inferido.

## 2. Configuração / opt-in
`public.comunicador_alerta_config`: `user_id` PK→auth.users; `recebe_alertas_central boolean default false`; `ativo boolean default true`; `ultimo_alerta_em timestamptz`; `ultimo_snapshot jsonb`; `created_at`; `updated_at` + trigger `update_updated_at_column`. Recebimento desligado por padrão; não duplica CPF/celular (telefone vem de `profiles`). Garantir função "Comunicador" em `funcoes_voluntariado` se não existir.

## 3. Critérios de disparo (parametrizáveis em `regras_operacionais`)
- `central_alerta_ativo` (default true)
- `central_alerta_minutos_pendencia` (default 10)
- `central_alerta_min_pendencias` (default 2)
- `central_alerta_cooldown_min` (default 30)
- `central_alerta_piora_minutos` (default 5) — limiar mínimo de piora por tempo

Disparar quando: ≥1 pendência há mais de X min **OU** ≥Y pendências sem atendente. Frequência do cron fixa (~5 min); critérios/cooldown configuráveis.

## 4. Consolidação (anti-spam)
Um único alerta consolidado por Comunicador por ciclo:
> "Central FER: há N conversa(s) aguardando atendimento humano (mais antiga há M min). Acesse a Central para assumir a fila."
Sem nome do assistido, conteúdo da conversa, dados sensíveis ou uma mensagem por conversa.

## 5. Cooldown, snapshot e reenvio
`ultimo_snapshot`: `total_pendentes`, `idade_mais_antiga_min`, `gerado_em`, `motivo_disparo` (recomendado).
- **Piora relevante** = aumento de `total_pendentes` OU aumento de `idade_mais_antiga_min` acima de `central_alerta_piora_minutos`.
- Após o cooldown: reenviar só se a fila continuar pendente.
- Antes do cooldown: reenviar só se houver piora relevante.
Lógica determinística, simples e previsível.

## 6. Relação com claim
Avaliar só pendências `status='aberto'` sem `atendente_id`. Conversa assumida/em atendimento/encerrada sai do cálculo. Receber alerta não dá posse — posse exclusiva pelo claim seguro.

## 7. RPCs de apoio (SECURITY DEFINER, pequenas e estáveis)
- `fila_humana_pendente()` → `total_pendentes`, `idade_mais_antiga_min` (base `whatsapp_handoffs`).
- `comunicadores_elegiveis()` → `user_id`, `celular`; só elegíveis (função + voluntário ativo + telefone válido + vínculo único por telefone + opt-in + ativo). Sem CPF; exclui telefones ambíguos e vínculos não confiáveis.

## 8. Edge function `central-fila-alerta`
Padrão de `alertas-operacionais`: `guardCronOrStaff` + `x-cron-secret`, service_role. Fluxo: ler regras → verificar `central_alerta_ativo` → `fila_humana_pendente()` → validar gatilho → `comunicadores_elegiveis()` → por comunicador: reler estado, aplicar cooldown, comparar snapshot, **revalidar elegibilidade e gatilho antes do envio** → enviar consolidado via channel-adapter → atualizar `ultimo_alerta_em`/`ultimo_snapshot` → auditar.
**Idempotência:** cooldown + snapshot + revalidação de estado antes do envio impedem duplicidade para o mesmo comunicador no mesmo estado, mesmo com execuções sobrepostas.

## 9. Auditoria
`audit_logs` ação `ALERTA_CENTRAL_ENVIADO`, campos mínimos: `comunicador_user_id`, `telefone_destino_normalizado`, `gatilho_acionado`, `total_pendentes`, `idade_mais_antiga_min`, `snapshot_anterior`, `snapshot_novo`, `consolidado`, `enviado`, `erro` (se houver).

## 10. Frontend mínimo
Opt-in em local existente e coerente (Meu Perfil / card de preferências), exibido apenas quando fizer sentido para usuário elegível/Comunicador, para ligar/desligar alertas da Central. Exibir as novas chaves em Regras Operacionais reaproveitando a UI atual.

## 11. Segurança e privacidade
Só elegíveis recebem; edge function com permissões corretas; sem bypass de claim nem dupla posse. Mensagem minimalista; sem conteúdo da conversa, nome do assistido ou dados sensíveis.

## 12. Detalhes técnicos
- **Migration:** tabela `comunicador_alerta_config` (GRANTs: `authenticated` gerencia o próprio registro, `service_role` ALL; RLS própria + leitura admin; trigger updated_at); RPC `fila_humana_pendente()`; RPC `comunicadores_elegiveis()`.
- **Dados (insert tool):** inserir chaves em `regras_operacionais`; garantir função "Comunicador".
- **Edge:** nova function `central-fila-alerta`.
- **Cron:** `cron.schedule` (insert tool, contém URL+anon) a cada 5 min com `x-cron-secret`.
- **Lógica pura:** `src/lib/centralAlerta.ts` (gatilho, consolidação, cooldown, piora relevante, idempotência lógica).

## 13. Testes
Unitários (`centralAlerta.ts`): elegibilidade, telefone ambíguo → não elegível, gatilho, consolidação, cooldown, regra de piora, idempotência lógica, opt-in desligado → não recebe. Não-regressão: suíte WhatsApp (IA, handoff, classificador híbrido, orquestrador, métricas, claim). Typecheck + build limpos.

## 14. Critérios de aceite
Pendências identificadas corretamente; só elegíveis recebem; envio ao celular pessoal; consolidação; cooldown/anti-spam; conversa assumida deixa de alertar; posse só por claim; auditoria íntegra; telefones ambíguos não geram elegibilidade; sem regressão; build/typecheck/testes ok.

## 15. Forma de execução
Melhoria operacional da fila humana + alerta externo controlado + reforço de governança, sem arquitetura paralela, sem spam, sem quebra do estável. Ao concluir: parar e apresentar relatório (elegibilidade, vínculo por telefone, gatilho, cooldown, snapshot, consolidação, auditoria, testes executados, confirmação de ausência de regressão).