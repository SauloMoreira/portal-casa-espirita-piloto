# Q2-E1 — Inventário e priorização do backlog técnico residual

> **Recorte exclusivamente diagnóstico.** Nenhuma alteração produtiva foi
> realizada: sem mudança de código, schema, tabelas, dados, RLS, policies,
> grants, RPC, funções SQL, triggers, edge functions, UI, textos ou rotas.
> `AuthContext`, `ProtectedRoute`, notificações/fila e Q2-C/Q2-D intocados.

## 0. Indicadores (preservados)

- `0028 = 0`
- `0025 = 0`
- `0029 = 57`

`tsgo --noEmit`: **exit 0** (limpo).

## 1. Avaliações específicas solicitadas

| Pergunta | Resposta |
|---|---|
| `painel_conversas` ainda usa cast inseguro? | **Não.** `notificacoesService.ts:662` chama `supabase.rpc("painel_conversas", ...)` tipado, `if (error) throw error` e normaliza via `parseConversasResultado` (`notificacoesContracts.ts`). Sem `as any`/`as never`. |
| Retorno `jsonb` sensível sem tipo compartilhado? | **Não crítico.** Os retornos jsonb sensíveis já têm contrato: governança (`acessoService.ts`), plano/agenda (`planoRpcService.ts`), rollout (`excecoesContracts.ts`), voluntários (`voluntariosContracts.ts`), conversas (`notificacoesContracts.ts`). |
| Chamadas inline de RPC sensível fora do padrão Q1-C2? | **Não.** As 4 RPCs de governança do achado A-1 continuam encapsuladas em `acessoService.ts`. Nenhuma chamada inline sensível reintroduzida. |
| Algum `any` residual mascara erro de contrato? | **Baixo risco.** Os `(data as any)` restantes são leitura de UI (listagens) e leitura de `error` de edge functions, não decisões de contrato sensível. |
| Algum `as never` é risco real? | **Não.** Todos os `as never` são ruído de tipagem em `.insert/.update/.upsert` e payloads de RPC (limitação dos tipos gerados do Supabase). Nenhum altera comportamento. |

## 2. Inventário consolidado

| ID | Achado | Arquivo | Categoria | Criticidade | Risco | Correção sugerida | Recorte recomendado |
|----|--------|---------|-----------|-------------|-------|-------------------|---------------------|
| E1-01 | `painel_conversas` | `services/notificacoes/notificacoesService.ts:662` | Notificações / painel admin | **Sem ação** | Nenhum — já tipado e normalizado (Q1-C5) | Nenhuma | — |
| E1-02 | `as never` em `.insert/.update/.upsert` (payloads Supabase) | `voluntariosService.ts`, `voluntarios.ts`, `sessoesPublicas.ts`, `presencas.ts`, `programacaoPadraoService.ts`, `excecoesService.ts`, `migracaoLegado.ts`, `fazerEntrevista.ts` | Persistência (tratamentos, entrevistas, programação) | **Baixo** | Ruído de tipagem; oculta drift de coluna em tempo de compilação | Tipar payloads com `TablesInsert<>`/`TablesUpdate<>` | Q2-E2 (agrupável) |
| E1-03 | `as never` em payloads de RPC | `agendaPlano/orquestracao.ts`, `ia/sugestoes.ts` | Agenda/plano, IA | **Baixo** | Ruído de tipagem; sem impacto runtime | Tipar args de RPC | Q2-E2 (agrupável com E1-02) |
| E1-04 | `rotulo(item as never)` | `pages/Observabilidade.tsx:56` | Painel observabilidade | **Cosmético** | Nenhum funcional | Tipar união do item | Melhoria futura |
| E1-05 | `(data as any)?.error` em respostas de edge function | `SolicitarCadastro.tsx`, `SolicitacoesCadastro.tsx`, `SegurancaConta.tsx`, `MfaVerify.tsx`, `central-ia/BaseSiteIA.tsx` | Autocadastro, MFA, segurança conta, IA | **Médio** | Área sensível (auth/MFA/cadastro); `any` pode mascarar mudança de contrato da function | Criar tipo de retorno compartilhado das edge functions e `unwrap` tipado | Q2-E3 (isolado — área sensível) |
| E1-06 | `(data as any)` em listagens de UI | `Assistidos.tsx:108`, `Tratamentos.tsx:69`, `FuncoesVoluntariado.tsx:47` | Listagens (tratamentos/assistidos) | **Baixo** | Perda de tipo na renderização; sem risco de segurança | Tipar estado com `Tables<>` | Melhoria futura (agrupável) |
| E1-07 | Mapeamentos `(x: any) =>` em transformação de dados | `Excecoes.tsx`, `Usuarios.tsx`, `CartaAgendamento.tsx`, `EscopoOperacional.tsx`, `TarefeiroDashboard.tsx` | Relatórios/exceções/usuários | **Baixo** | Legibilidade/consistência; sem decisão de autorização | Tipar linhas mapeadas | Melhoria futura |
| E1-08 | `catch (err: any)` | ~vários (Governança, Usuarios, Eventos, etc.) | Transversal | **Cosmético** | Padrão idiomático de erro; sem risco | `catch (err: unknown)` + narrow | Melhoria futura opcional |
| E1-09 | `(data as any)` em serviços de relatórios | `relatorios/*.ts`, `dashboard/adminDashboard.ts` | Relatórios | **Baixo** | Perda de tipo em agregação; leitura apenas | Tipar retorno das queries | Melhoria futura (agrupável) |
| E1-10 | Conta auth legada sem profile | DB — `user_id 29777e60-abe7-46dd-a8c3-f6fef6e29022` | Autenticação/roles | **Baixo** (dado) | Órfã: role `assistido` sem `profiles`; fora do fluxo atual; não afeta novos cadastros | **Nenhuma agora** — limpeza auditada futura | Q2-E4 (isolado, limpeza de dado) |

### Confirmação da conta legada (E1-10)
Consulta a `user_roles` × `profiles`:
- `user_id`: `29777e60-abe7-46dd-a8c3-f6fef6e29022` — **existe**.
- role `assistido` — **confirmada**.
- `profiles` correspondente — **ausente** (`tem_profile = false`).
- Impacto funcional atual: **nenhum** no autocadastro (Q2-D1/D2 validaram o fluxo novo).
- Ação nesta etapa: **nenhuma** (não excluir, não corrigir, não criar profile).

## 3. Áreas sensíveis tocadas pelos achados

- **Autenticação / MFA / autocadastro:** E1-05 (médio) — único achado sensível relevante.
- **Roles:** E1-10 (dado órfão, baixo).
- **Governança de acesso / RPC administrativa:** nenhum achado — padrão Q1-C2 íntegro.
- **Notificações:** E1-01 — sem ação.
- **Entrevistas / tratamentos / relatórios / painel admin:** apenas ruído de tipagem (baixo/cosmético).

## 4. Separação por ação

- **Correção recomendada (próximo recorte):** E1-05 (contrato tipado das edge functions em área sensível).
- **Apenas melhoria futura (débito técnico):** E1-02, E1-03, E1-04, E1-06, E1-07, E1-08, E1-09.
- **Sem ação necessária:** E1-01 (já resolvido), E1-10 (monitorar; limpeza futura opcional).

## 5. Priorização sugerida para próximos recortes

1. **Q2-E2** — Blindagem de tipos de persistência: substituir `as never` por `TablesInsert<>`/`TablesUpdate<>` (E1-02, E1-03). Baixo risco, alto ganho de proteção contra drift de coluna.
2. **Q2-E3** — Contrato tipado de retorno das edge functions sensíveis (E1-05). Isolado por tocar auth/MFA/cadastro.
3. **Q2-E4** — Limpeza auditada da conta auth legada órfã (E1-10). Isolado por alterar dado.
4. **Débito menor (sem urgência):** E1-04, E1-06, E1-07, E1-08, E1-09 — agrupáveis quando conveniente.

## 6. Testes antes/depois

| Recorte | Exige teste? |
|---|---|
| Q2-E2 | Sim — snapshot de payloads enviados por serviço afetado (regressão de contrato). |
| Q2-E3 | Sim — teste de `unwrap`/propagação de erro das edge functions (área sensível). |
| Q2-E4 | Sim — verificação pré/pós de que nenhum vínculo funcional depende do `user_id` antes de qualquer limpeza. |
| Melhorias menores | Não obrigatório (mudança de tipo sem efeito runtime). |

## 7. Agrupamento seguro × isolamento

- **Agrupáveis:** E1-02 + E1-03 (mesma natureza de tipagem de persistência/RPC); E1-06 + E1-07 + E1-09 (tipagem de leitura de UI/relatórios).
- **Isolar em recorte próprio:** E1-05 (auth/MFA/cadastro) e E1-10 (alteração de dado).

## 8. Recomendação executiva

- **Fazer agora:** nada obrigatório. O sistema não tem achado crítico nem alto-crítico ativo; `painel_conversas` e o padrão Q1-C2 estão íntegros.
- **Fazer a seguir (opcional, ordem sugerida):** Q2-E2 → Q2-E3 → Q2-E4.
- **Não precisa tratar:** E1-01 (resolvido) e os cosméticos (E1-04, E1-08) enquanto não houver refactor da área.
- **Bloqueador real:** **nenhum.** A conta legada (E1-10) é inerte e não impacta o fluxo atual.

## 9. Confirmação final

Nenhuma alteração produtiva foi realizada neste recorte. Apenas leitura de código,
consulta ao banco (somente `SELECT`) e produção deste inventário.
