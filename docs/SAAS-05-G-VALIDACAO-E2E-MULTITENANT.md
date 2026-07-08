# SAAS-05-G — Validação E2E multi-tenant pós-cutover

Status: concluído.
Escopo: validação, testes E2E de contrato, correções pontuais, inventário de depreciação.
Não altera dados reais, não cria tenant FER real, não altera projeto FER original,
não remove RPCs legadas nem fallbacks residuais.

## 1. Cenário E2E — tenants e usuários sintéticos

Fixtures sintéticas usadas por toda a validação, sem dados reais e sem dados pessoais:

| Papel                 | Tenant | Observação                                       |
| --------------------- | ------ | ------------------------------------------------ |
| Instituição A         | A      | Casa Espírita Demo A (sintética)                 |
| Instituição B         | B      | Casa Espírita Demo B (sintética)                 |
| admin local A         | A      | Papel administrador escopado ao tenant A         |
| admin local B         | B      | Papel administrador escopado ao tenant B         |
| usuário comum A       | A      | Voluntário/tarefeiro sintético                   |
| usuário comum B       | B      | Voluntário/tarefeiro sintético                   |
| usuário sem vínculo   | —      | Autenticado sem instituicao_id ativa             |
| vínculo inativo       | A      | Vínculo marcado inativo                          |
| platform_admin        | —      | Papel global, escopo documentado                 |

Regras:
- todos os IDs são sintéticos (uuid v4 gerados em fixture);
- nenhum dado da FER foi utilizado;
- projeto FER original permanece intocado.

## 2. Validação de RLS nas 13 T-DIR

Tabelas cobertas:
`assistidos, voluntarios, palestras, sessoes_publicas, avisos_internos, campanhas,
eventos, acao_social_alimentos, regras_operacionais, excecoes_operacionais,
programacao_padrao, configuracoes_gerais, comunicacoes_institucionais`.

Cenários validados pela suíte E2E de contrato + revisão manual de policies:

| Cenário                                                | Esperado | Resultado |
| ------------------------------------------------------ | -------- | --------- |
| usuário A lê registros da instituição A                | permitir | ok        |
| usuário A lê registros da instituição B                | negar    | ok        |
| usuário B lê registros da instituição A                | negar    | ok        |
| admin local A administra B                             | negar    | ok        |
| usuário sem vínculo lê dados funcionais                | negar    | ok        |
| vínculo inativo lê dados funcionais                    | negar    | ok        |
| platform_admin sem tenant ativo lê dados operacionais  | negar    | ok        |
| platform_admin com tenant ativo lê como admin daquele  | permitir | ok (documentado) |

Base efetiva: `shadow_tenant_all_<tabela>` + policies de autoacesso preservadas
(`Assistido views own record`, `Assistido updates own record`, `User views own avisos`,
`User updates own avisos`). Nenhuma policy legada `has_role`-only reintroduzida.

## 3. Validação de NOT NULL

Confirmado pelo cutover F3 e revalidado por contrato:
- insert sem `instituicao_id` falha nas 13 T-DIR (constraint NOT NULL);
- insert com `instituicao_id` válido do tenant do usuário funciona quando há permissão;
- insert com `instituicao_id` de outro tenant é bloqueado pela policy `shadow_tenant_all_*`;
- frontend/services injetam `instituicao_id` via `requireInstituicaoId()` nos pontos
  ajustados no F3 (`acaoSocial`, `campanhas`, `eventos`, `comunicacaoInstitucional`,
  `GestaoCores`, `RegrasOperacionais`, `SessoesPublicas`).

## 4. Validação frontend operacional

Fluxos revalidados com tenant ativo:

- TenantSwitcher troca tenant e persiste seleção em `useSelectedInstituicao`;
- `RequireInstituicao` bloqueia rotas quando não há tenant selecionado;
- Dashboard, Assistidos, Voluntários, Palestras, Sessões Públicas,
  Agenda/Tratamentos, Entrevistas, Avisos de ausência, Campanhas, Eventos,
  Ação Social, Comunicação Institucional, Relatórios, Observabilidade,
  Central IA — todos os consumidores usam `useSelectedInstituicao` ou
  `requireInstituicaoId()` conforme a camada.

Sem regressão observada. Nenhum refactor amplo executado.

## 5. Validação de RPCs tenant-aware

Cobertas via testes de contrato dos recortes E1/E2/E3/E4 e EDGE-A2:
- assinatura tenant-aware exige `p_instituicao_id` correto;
- `p_instituicao_id` de outro tenant → erro (fail-closed);
- ausência de `p_instituicao_id` quando obrigatório → erro;
- overloads legados não são chamados pelo frontend/services novos.

## 6. Inventário de RPCs legadas para depreciação

Sem revogação neste recorte (fora de escopo). Diagnóstico:

| Categoria                          | Ação recomendada                       |
| ---------------------------------- | -------------------------------------- |
| Overloads legados sem consumidor   | revogar em SAAS-05-H (lote A)          |
| Overloads consumidos por cron      | manter até migração do cron (SAAS-05-H lote B) |
| Overloads consumidos por service_role em edges já migradas | remover após 1 sprint de observabilidade (SAAS-05-H lote C) |
| Overloads mistos frontend legado   | plano de migração explícito, sem prazo neste recorte |

Nenhuma RPC legada foi removida ou revogada aqui.

## 7. Edge functions e dispatchers

Regressão e isolamento revisados:

`checkin-publico, alertas-operacionais, central-fila-alerta, notificacoes-dispatch,
comunicacao-dispatch, whatsapp-inbound, whatsapp-responder, assistente-entrevista,
insights-dashboard, ia-site-ingestao, conteudo-imagem-ia`.

- resolvem tenant conforme contrato do recorte de origem;
- tenant ambíguo → fail-closed;
- logs/auditoria registram `tenant_resolvido` onde aplicável;
- opt-out, consentimento, idempotência, retry e handoff preservados.

Nenhuma edge alterada neste recorte.

## 8. Fallbacks residuais

| Edge                    | Fallback                          | Diagnóstico     | Recomendação                |
| ----------------------- | --------------------------------- | --------------- | --------------------------- |
| central-fila-alerta     | tenant por herança do item da fila| fail-closed ok  | manter até SAAS-05-H        |
| whatsapp-inbound        | tenant por número institucional   | fail-closed ok  | manter, revisar em H        |
| alertas-operacionais    | tenant por origem do alerta       | fail-closed ok  | manter, remover em H se possível |

Nenhum fallback permite cross-tenant. Remoção formal fica para SAAS-05-H.

## 9. Indicadores e scanner

- 0028: sem regressão em relação ao fechamento do F3.
- 0025: sem regressão.
- 0029: sem regressão; findings S4 (F1/F2/F3) permanecem resolvidos.
- Warnings `authenticated_security_definer_function_executable`: sem reabertura de
  PUBLIC/anon; permanecem os itens já justificados em S3/S4.

Delta atribuível ao SAAS-05-G: **0028 +0, 0025 +0, 0029 +0**.

## 10. Riscos remanescentes

- Fallbacks residuais (item 8) continuam ativos por decisão de compatibilidade.
- RPCs legadas continuam expostas até SAAS-05-H.
- Ambiente ainda não recebeu dados reais — validação depende de fixtures sintéticas.
- Não há tenant FER real; qualquer piloto real exige SAAS-05-H concluído.

## 11. Recomendação

Autorizar **SAAS-05-H** com:
- revogação faseada das RPCs legadas conforme inventário (lotes A/B/C);
- remoção formal ou hardening dos fallbacks residuais;
- rodada final de scanner e observabilidade antes de qualquer piloto real.

## 12. Confirmações obrigatórias

- Nenhum dado real migrado.
- Projeto FER original intocado.
- Nenhuma RPC legada removida.
- Nenhum fallback residual removido.
- Nenhuma edge function alterada.
- Nenhuma policy alterada além do já feito em F3.
- Nenhuma migração aplicada neste recorte.
