# Mapa de Cobertura de Invariantes & Contratos

> Documento **vivo**. Liga cada invariante (`INV-*`) e contrato crítico do sistema
> ao teste executável que o protege. Atualize ao criar/refinar invariantes ou ao
> adicionar/remover testes de governança.

Suíte: `src/test/governanca/` (74 testes). Total do projeto: **901 testes**.

## Legenda
- ✅ **Protegida** — invariante coberta por teste estrutural executável.
- 🟡 **Parcial** — coberta no espelho/lógica pura; efeito de banco verificado indiretamente.
- ⬜ **Pendente** — sem teste automatizado dedicado (depende de execução real no banco).

## Invariantes de arquitetura
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-ARQ-001 Backend é fonte de verdade | 🟡 | Espelhos testados como contraparte das `fn_*`; autoria final no banco |
| INV-ARQ-002 UI não implementa lógica paralela | ✅ | `contratos-central.test.ts` (UI só traduz código do backend) |
| INV-ARQ-003 Ação sensível auditável | ⬜ | Auditoria via trigger no banco (não unit-testável aqui) |
| INV-ARQ-004 Permissão validada no backend | ⬜ | RLS / `SECURITY DEFINER` (cobertura via security scan) |

## Agenda e tratamento
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-AGD-001 Agenda real é a fonte operacional | 🟡 | `invariantes-agenda-tratamento.test.ts` (`ehProxima`) |
| INV-AGD-002 Uma próxima sessão válida por vez | ✅ | `invariantes-agenda-tratamento.test.ts` |
| INV-AGD-003 Remarcação invalida a anterior | ✅ | `invariantes-agenda-tratamento.test.ts` + regressão |
| INV-AGD-004 Cancelamento invalida a sessão | ✅ | `invariantes-agenda-tratamento.test.ts` |
| INV-AGD-005 Exceção reflete efeito real na agenda | 🟡 | `invariantes-excecao-operacional.test.ts` (efeito no banco ⬜) |

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
| INV-SEG-001 Funções críticas protegidas | ⬜ | `SECURITY DEFINER`/`search_path` (linter/scan) |
| INV-SEG-002 Ação sensível com confirmação explícita | ⬜ | UI de confirmação (cobertura E2E futura) |
| INV-SEG-003 Idempotência em ações críticas | 🟡 | Dedupe em `checkinDedupe.test.ts`; demais ⬜ |

## Presença (geral × operacional)
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-PRES-001 Geral separada da operacional | ✅ | `invariantes-presenca.test.ts` |
| INV-PRES-002 Fonte única; justificado é só histórico | ✅ | `invariantes-presenca.test.ts` + regressão |
| INV-PRES-003 Escrita em presença auditável | ⬜ | Trigger `trg_audit_presencas` (banco) |

## Governança operacional
| Invariante | Status | Onde |
| --- | --- | --- |
| INV-GOV-001 Flags/parâmetros governados | ✅ | `contratos-governanca-parametros.test.ts` |
| INV-GOV-002 Mudança crítica observável | ⬜ | Métricas/observabilidade operacional |
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
| `fn_confirmacao_entrevista_ativa` | ⬜ | Flag governada — efeito no trigger (banco) |
| `fn_enfileirar_mensagem_manual` (validação) | ✅ | `invariantes-acao-manual.test.ts` |

## Pendências de cobertura (próxima sequência)
Os itens ⬜ acima dependem de execução real no banco (triggers, RLS, auditoria,
idempotência de RPC). A sequência natural é cobri-los com testes de integração de
banco/edge functions, registrados como item no backlog de governança.
