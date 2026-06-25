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
