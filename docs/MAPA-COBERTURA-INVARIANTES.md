# Mapa de Cobertura de Invariantes & Contratos

> Documento **vivo**. Liga cada invariante (`INV-*`) e contrato crítico do sistema
> ao teste executável que o protege. Atualize ao criar/refinar invariantes ou ao
> adicionar/remover testes de governança.

Suíte de governança (unitária/espelho): `src/test/governanca/` (74 testes).
Suíte de integração REAL de banco (L-07): `src/test/integration/db/` (18 testes,
runner `npm run test:db`). Total do projeto (unit): **901 testes**.

## Legenda
- ✅ **Protegida** — invariante coberta por teste estrutural executável.
- ✅🗄️ **Protegida no banco real** — coberta por teste de integração real (L-07).
- 🟡 **Parcial** — coberta no espelho/lógica pura; efeito de banco verificado indiretamente.
- ⬜ **Pendente** — sem teste automatizado dedicado (depende de execução real no banco).

## Invariantes de arquitetura
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-ARQ-001 Backend é fonte de verdade | 🟡 | Espelhos testados como contraparte das `fn_*`; autoria final no banco |
| INV-ARQ-002 UI não implementa lógica paralela | ✅ | `contratos-central.test.ts` (UI só traduz código do backend) |
| INV-ARQ-003 Ação sensível auditável | ✅🗄️ | `auditoria.dbtest.ts` (param/presença/entrevista gravam trilha real) |
| INV-ARQ-004 Permissão validada no backend | ✅🗄️ | `rls-permissoes.dbtest.ts` (RPCs SECURITY DEFINER barram papel/anon); RLS por tabela: presença/políticas verificadas, *enforcement* por linha ainda via scanner (sandbox não faz SET ROLE) |

## Agenda e tratamento
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-AGD-001 Agenda real é a fonte operacional | 🟡 | `invariantes-agenda-tratamento.test.ts` (`ehProxima`) |
| INV-AGD-002 Uma próxima sessão válida por vez | ✅ | `invariantes-agenda-tratamento.test.ts` |
| INV-AGD-003 Remarcação invalida a anterior | ✅ | `invariantes-agenda-tratamento.test.ts` + regressão |
| INV-AGD-004 Cancelamento invalida a sessão | ✅ | `invariantes-agenda-tratamento.test.ts` |
| INV-AGD-005 Exceção reflete efeito real na agenda | 🟡 | `invariantes-excecao-operacional.test.ts`; efeito real depende de UPDATE governado (sem grant no sandbox) — ainda ⬜ |

## Fila e notificações
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-FILA-001 Fila reflete só compromissos reais | ✅ | `invariantes-fila-notificacoes.test.ts` |
| INV-FILA-002 Um único lembrete válido por vínculo | ✅ | `invariantes-agenda-tratamento.test.ts` + regressão |
| INV-FILA-003 Sessão prevista não gera lembrete | ✅ | `invariantes-agenda-tratamento.test.ts` + regressão |
| INV-FILA-004 Respeita antecedência oficial | 🟡 | Antecedência configurável no banco; vencimento testado |
| INV-FILA-005 Confirmação antecipada só se habilitada | ✅ | `regressao-bugs-historicos.test.ts` |
| INV-FILA-006 Itens inválidos barrados antes do envio | ✅ | `invariantes-fila-notificacoes.test.ts` |

## Semântica temporal
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-TEMPO-001 Entrevista date-only não inventa horário | ✅ | `invariantes-temporais.test.ts` + regressão |
| INV-TEMPO-002 Data pura continua data pura | ✅ | `invariantes-temporais.test.ts` |
| INV-TEMPO-003 Só converte fuso com hora real | ✅ | `invariantes-temporais.test.ts` |

## Ação manual / humana
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-MANUAL-001 Mensagem manual passa pelo pipeline | ✅ | `invariantes-acao-manual.test.ts` |
| INV-MANUAL-002 Manual não altera consentimento/opt-out | ✅ | `invariantes-acao-manual.test.ts` |
| INV-MANUAL-003 Encerrar item não bloqueia a pessoa | ✅ | `invariantes-acao-manual.test.ts` |

## Exceção operacional
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-EXC-001 Cancelamento ≠ remarcação | ✅ | `invariantes-excecao-operacional.test.ts` |
| INV-EXC-002 Público sem alvo rastreável não notifica | ✅ | `invariantes-excecao-operacional.test.ts` |
| INV-EXC-003 Exceção só afeta o escopo válido | ✅ | `invariantes-excecao-operacional.test.ts` |

## Segurança e confiabilidade
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-SEG-001 Funções críticas protegidas | ✅🗄️ | `rls-permissoes.dbtest.ts` (checagem de papel real nas RPCs); `search_path` via linter |
| INV-SEG-002 Ação sensível com confirmação explícita | ⬜ | UI de confirmação (cobertura E2E futura) |
| INV-SEG-003 Idempotência em ações críticas | ✅🗄️ | `idempotencia.dbtest.ts` (barreira `dedupe_key`/`ON CONFLICT` real) + `checkinDedupe.test.ts` |

## Presença (geral × operacional)
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-PRES-001 Geral separada da operacional | ✅ | `invariantes-presenca.test.ts` |
| INV-PRES-002 Fonte única; justificado é só histórico | ✅ | `invariantes-presenca.test.ts` + regressão |
| INV-PRES-003 Escrita em presença auditável | ✅🗄️ | `auditoria.dbtest.ts` (insert real dispara `trg_audit_presencas`) |

## Governança operacional
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-GOV-001 Flags/parâmetros governados | ✅ | `contratos-governanca-parametros.test.ts` |
| INV-GOV-002 Mudança crítica observável | ✅🗄️ | `auditoria.dbtest.ts` (alteração de parâmetro grava antes/depois + autor) |
| INV-GOV-003 Frente crítica com contenção | ⬜ | Kill switches (verificação operacional) |
| INV-OBS-001 Indicadores somente leitura, de fonte canônica, sem efeito | ✅🗄️ | `observabilidade-operacional.test.ts` (contrato/tradução/vazio) + `observabilidade.dbtest.ts` (autorização real + somente leitura) |



## Contratos protegidos
| Contrato | Status | Onde |
| --- | --- | --- |
| `fn_fila_motivo_inelegivel` (sessão) | ✅ | `contratos-backend-critico.test.ts` |
| `fn_fila_motivo_inelegivel` (entrevista) | ✅ | `contratos-backend-critico.test.ts` |
| `fn_presenca_classificacao` | ✅ | `contratos-backend-critico.test.ts` |
| `fn_atualizar_parametro_operacional` (espelho) | ✅ | `contratos-governanca-parametros.test.ts` |
| `fn_fila_diagnostico_pendentes` (rótulos/tom) | ✅ | `contratos-central.test.ts` |
| Rótulos de motivo (Central) | ✅ | `contratos-central.test.ts` |
| `fn_confirmacao_entrevista_ativa` | ✅🗄️ | `triggers-entrevista.dbtest.ts` (flag ON/OFF muda enfileiramento real) |
| `fn_enfileirar_mensagem_manual` (validação) | ✅ | `invariantes-acao-manual.test.ts` |

## Camada de integração real de banco (L-07)
Suíte `src/test/integration/db/*.dbtest.ts` (runner próprio `npm run test:db`,
fora do CI/unit). Cada teste roda dentro de uma transação **sempre revertida**
(`ROLLBACK`), simula o usuário via `request.jwt.claims` (igual ao Supabase) e
exercita o trigger/função reais — sem espelho TS. Cobre:
- **Permissão real (RPC SECURITY DEFINER):** parâmetro governado, mensagem manual
  e encerramento de item por erro de cadastro barram papéis não autorizados e anon.
- **Trigger governado de entrevista:** flag ON enfileira `entrevista_criada`; flag
  OFF não; lembrete sempre; date-only sem horário fantasma.
- **Auditoria real:** alteração de parâmetro, presença e entrevista gravam trilha.
- **Idempotência real:** barreira `dedupe_key`/`ON CONFLICT DO NOTHING`.
- **Contrato de classificação:** banco × espelho concordam; justificado só histórico.

> **AVM-001 (resolvido 2026-06-25):** migração corretiva de `fn_notif_presenca`
> (`v_evento::notif_evento`) aplicada; rerun da suíte de banco confirma o registro de
> presença `presente`/`ausente` funcionando — **18/18 verde**, unidade **901 verde**.

## Pendências de cobertura (próxima sequência)
Itens que ainda **não** têm prova de execução real (limites do ambiente):
- **RLS *por linha* (enforcement):** o papel do sandbox tem `BYPASSRLS` e não pode
  `SET ROLE authenticated`, então a negação por política de linha não é executável
  aqui. Mitigado por: verificação de RLS habilitada + políticas presentes
  (`rls-permissoes.dbtest.ts`), checagem de papel real nas RPCs, e o security scanner.
  Fechar de fato exige E2E via PostgREST com JWT de usuário real.
- **INV-AGD-005 / INV-EXC efeito real na agenda:** dependem de `UPDATE` governado
  em tabelas operacionais (sem grant direto no sandbox) — manter como E2E futuro.
- **INV-SEG-002 (confirmação explícita na UI):** cobertura E2E de interface.

## Camada E2E real de RLS/JWT/PostgREST (P1.1)
Suíte `src/test/e2e-rls/*.e2etest.ts` (runner próprio `npm run test:e2e:rls`,
fora do CI/unit e do runner de banco). Prova o **caminho real de acesso**:
login por senha no GoTrue → **JWT real** → endpoints **PostgREST reais** → RLS
**por linha** efetivamente aplicada por perfil. Não usa `BYPASSRLS` nem simula
`request.jwt.claims`; o `auth.uid()`/`has_role()`/política rodam de verdade.

**Ferramenta:** Vitest (node) + `fetch` real contra GoTrue/PostgREST. **Perfis de
teste reais (namespaced):** `e2e-rls-{admin,coordenador,entrevistador,tarefeiro,
assistido}@lovable.test` + anônimo (anon-key) e sem-JWT. **Fixtures:** seed
namespaced (`e2e_rls`) criado pelo caminho real (JWT admin + RPC do próprio
assistido) e limpeza idempotente por namespace ao final.

| Superfície / contrato | Prova observada | Status |
| --- | --- | --- |
| Entrevista — tabela direta (tarefeiro) | RLS por linha → vazio, sem `observacoes/decisoes` | ✅🔐 |
| Entrevista — `fn_entrevistas_operacional` (tarefeiro) | payload reduzido (6 colunas, sem sensível) | ✅🔐 |
| Entrevista — entrevistador/admin | leem conteúdo sensível permitido | ✅🔐 |
| Entrevista — coordenador fora de escopo | RLS por linha → vazio | ✅🔐 |
| Entrevista — anônimo (sem JWT) | 401 | ✅🔐 |
| Aviso — tabela direta (tarefeiro) | sem vazamento de `motivo` | ✅🔐 |
| Aviso — `fn_avisos_ausencia_pendentes` (tarefeiro) | `pode_ver_conteudo=false`, `motivo=null` | ✅🔐 |
| Aviso — coordenação/entrevistador | conteúdo completo (`pode_ver_conteudo=true`) | ✅🔐 |
| Aviso — assistido | só as próprias linhas; alheio → vazio | ✅🔐 |
| Parâmetro governado — admin | altera pelo caminho real (RPC) | ✅🔐 |
| Parâmetro governado — tarefeiro/entrevistador/assistido | `Permissão negada` | ✅🔐 |
| RPCs sensíveis (7) | sucesso p/ perfil certo, negação coerente p/ indevido, 401 anon | ✅🔐 |

> **Pendência RLS *por linha* — FECHADA (P1.1).** O que antes só estava mitigado
> (presença de política + checagem de papel em RPC) agora tem **prova de
> comportamento observado** com JWT e PostgREST reais. RPCs cobertas no caminho
> real: `fn_entrevistas_operacional`, `fn_avisos_ausencia_pendentes`,
> `fn_registrar_aviso_ausencia`, `fn_tratar_aviso_ausencia`,
> `fn_atualizar_parametro_operacional`, `fn_enfileirar_mensagem_manual`,
> `fn_encerrar_item_fila_erro_cadastro`.

**Fora do escopo desta frente:** efeito real de exceção na agenda (INV-AGD-005) e
confirmação explícita de UI (INV-SEG-002) seguem como E2E de interface futuro;
provisionamento dos usuários de teste é one-shot (admin API), não recorrente.

## Reorganização de Gestão — Acesso / Atuação / Escopo (Etapas 0–6)

Frente concluída de ponta a ponta. Modelo de 4 camadas independentes (Pessoa,
Acesso, Atuação, Escopo) com **nenhuma mutação cruzada** — exceto a concessão
automática do papel base `assistido`.

| Invariante | Camada | Prova | Status |
| --- | --- | --- | --- |
| INV-ACC-BASE-001/002/003 | Acesso (base) | `acesso-base-assistido.dbtest.ts` (trigger idempotente + backfill) | ✅🗄️ |
| INV-ACC-GOV-001 | Acesso (elevado) | `etapa3-classificacao-acesso.test.ts`, `etapa6-fechamento-reorganizacao.test.ts` | ✅ |
| INV-ATU-CATALOGO-001 / NOCROSS-001 / GATING-001 | Atuação | `etapa4-atuacao-catalogo.test.ts`, `etapa6-fechamento-reorganizacao.test.ts` | ✅ |
| INV-ESC-FONTE-001 | Escopo (N:N) | campo único removido na migração; nenhum consumidor lê o legado | ✅ |
| INV-ESC-NOCROSS-001 | Escopo | `etapa5-escopo-operacional.test.ts`, `etapa6-fechamento-reorganizacao.test.ts` | ✅ |
| INV-ACC-COORD-NN-001 | Escopo | relação N:N `coordenacao_tratamento` + RPCs de leitura/designação | ✅ |

**Limpeza de legado consolidada (Etapa 6):**
- `tipos_tratamento.coordenador_responsavel_id` removido (migração) e **não há**
  mais nenhum consumidor lendo o campo em `src/` ou nas edge functions.
- `supabase/functions/manage-user/index.ts`: bloqueio de exclusão atualizado para
  ler o escopo pela relação N:N (`coordenacao_tratamento.coordenador_id`), em vez
  do campo único removido — preservando a proteção de integridade referencial.

**Coerência consultiva (apenas alertas, jamais mutação):**
- `verificarCoerenciaAtuacaoAcesso` (atuação × acesso)
- `coerenciaEscopoAcesso` (escopo × acesso)

> **Débito residual:** nenhum bloqueante para esta frente. Itens de E2E de UI
> (INV-SEG-002 / INV-AGD-005) seguem fora deste escopo, como já registrado na
> seção da camada E2E.
