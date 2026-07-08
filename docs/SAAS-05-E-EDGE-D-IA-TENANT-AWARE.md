# SAAS-05-E-EDGE-D — IA ampla tenant-aware

**Status:** concluído.
**Marcador:** `saas05_e_edge_d`.
**Escopo:** exclusivamente as edge functions de IA ampla.

## 1. Inventário das edge functions de IA

| Função | Papel |
|---|---|
| `assistente-entrevista` | Analisa observações da entrevista fraterna e sugere tratamentos com base no catálogo IA. |
| `insights-dashboard` | Gera insights operacionais a partir de dados agregados do dashboard. |
| `ia-site-ingestao` | Extrai prévia textual/estrutural de páginas do site institucional. |
| `conteudo-imagem-ia` | Gera/otimiza imagens institucionais via modelo multimodal e salva no bucket. |

Tabelas consultadas / gravadas por essas funções (sem alterar schema neste recorte):
- Leitura: `entrevistas_fraternas`, `assistidos`, `ia_configuracoes`, `ia_queixas`, `ia_queixa_tratamento`, `ia_biblioteca`, `ia_site_documentos`, `instituicao_usuarios`.
- Escrita: `ia_sugestoes`, `audit_logs`, storage `avatars/conteudo-ia/*`.

## 2. Estratégia tenant-aware por fluxo

### `assistente-entrevista`
- Resolve tenant seguindo a cadeia `entrevista_id → entrevistas_fraternas.assistido_id → assistidos.instituicao_id`; usa `assistido_id` do payload como fallback.
- Se `tenantResolvido` for nulo → **fail-closed 400** com `SAAS05_E_EDGE_D_TENANT_INDETERMINADO`.
- Valida membership em `instituicao_usuarios` (`ativo = true`) ou `is_platform_admin(user_id)`; caso contrário **403** `SAAS05_E_EDGE_D_TENANT_FORBIDDEN`.
- Auditoria final `SAAS05_E_EDGE_D_ASSISTENTE` inclui `tenant_resolvido`, `origem_tenant` (`entrevista` | `assistido`), `marcador`.

### `insights-dashboard`
- Exige `p_instituicao_id` no payload; ausente → 400 `SAAS05_E_EDGE_D_TENANT_INDETERMINADO`.
- Valida membership no tenant informado; falha → 403 `SAAS05_E_EDGE_D_TENANT_FORBIDDEN`.
- Prompt do usuário passa a incluir `INSTITUICAO (tenant escopo obrigatório): <uuid>` para escopar explicitamente o contexto.
- Auditoria `SAAS05_E_EDGE_D_INSIGHTS`.

### `ia-site-ingestao`
- Exige `p_instituicao_id`/`instituicao_id` no payload; ausente → 400 `SAAS05_E_EDGE_D_TENANT_INDETERMINADO`.
- Se veio autenticação de staff (não cron), valida membership admin no tenant; senão 403 `SAAS05_E_EDGE_D_TENANT_FORBIDDEN`.
- Preview retornada inclui `instituicao_id` e `tenant_resolvido`, garantindo que a próxima gravação (fase seguinte) já saia com escopo correto.
- Auditoria `SAAS05_E_EDGE_D_SITE_INGESTAO` na conclusão da ingestão.

### `conteudo-imagem-ia`
- Exige `p_instituicao_id` no payload; ausente → 400 `SAAS05_E_EDGE_D_TENANT_INDETERMINADO`.
- Valida membership no tenant; falha → 403 `SAAS05_E_EDGE_D_TENANT_FORBIDDEN`.
- Storage segregado: `conteudo-ia/<tenant>/<user_id>/<uuid>.<ext>` — imagens de uma instituição nunca aterrissam no diretório de outra.
- Auditoria `SAAS05_E_EDGE_D_IMAGEM` com `storage_path`, `modo`, `formato`.

## 3. Prompts e contexto IA
- `assistente-entrevista`: prompt continua sem PII; contexto de queixas/base doutrinária vem do catálogo global (não é PII por tenant); a decisão fail-closed impede que a IA receba `observacoes` de um usuário sem tenant válido.
- `insights-dashboard`: prompt marca o tenant explicitamente; o `dashboardData` continua sendo montado no cliente com escopo próprio, e o tenant informado passa a acompanhar a auditoria — futuras evoluções podem checar coerência do payload contra RPCs tenant-aware.
- `ia-site-ingestao`: sem envio a modelo — extração local do HTML; não há risco de contexto cruzado no prompt.
- `conteudo-imagem-ia`: o prompt vem do admin autenticado do tenant, e o arquivo gerado é gravado no diretório do próprio tenant.

## 4. Chamadas para RPCs tenant-aware
- Todas as funções passam a chamar `is_platform_admin(p_user_id)` (SECURITY DEFINER já existente) para bypass administrativo.
- Nenhuma RPC de negócio (E1/E2/E3/E4) precisou ser adaptada neste recorte — o EDGE-D não altera fluxos de fila/comunicadores.

## 5. Auditoria
Todos os pontos de decisão registram, quando aplicável:
- `tenant_resolvido`, `origem_tenant`, `marcador: "saas05_e_edge_d"`;
- ações dedicadas: `SAAS05_E_EDGE_D_ASSISTENTE`, `SAAS05_E_EDGE_D_INSIGHTS`, `SAAS05_E_EDGE_D_SITE_INGESTAO`, `SAAS05_E_EDGE_D_IMAGEM`, `SAAS05_E_EDGE_D_TENANT_INDETERMINADO`, `SAAS05_E_EDGE_D_TENANT_FORBIDDEN`.

## 6. Testes
- Nova suíte `src/test/governanca/saas05eEdgeD-ia-tenant-aware.test.ts` cobre marcação, auditoria, fail-closed, membership, segregação de storage e isolamento em relação a EDGE-A/A2/B/C.
- Todas as suítes anteriores continuam verdes.

## 7. Riscos remanescentes
- Tabelas `ia_*` (`ia_sugestoes`, `ia_configuracoes`, `ia_queixas`, `ia_biblioteca`, `ia_site_documentos`) ainda são globais — a tenantização estrutural depende do lote de schema e não faz parte deste recorte.
- `dashboardData` continua sendo montado no cliente; o tenant informado passa pela edge, mas a coerência ponta-a-ponta com o payload virá com as RPCs de dashboard tenant-aware.

## 8. Escopo preservado
- `checkin-publico`, `alertas-operacionais`, `central-fila-alerta`, `notificacoes-dispatch`, `comunicacao-dispatch`, `whatsapp-inbound`, `whatsapp-responder` — intocados.
- RLS/policies, `NOT NULL`, cutover — intocados.
- Projeto FER original — intocado.

## 9. Indicadores — delta EDGE-D
- `0028`: **+0** — nenhuma nova policy shadow ou órfã.
- `0025`: **+0** — nenhuma exposição pública introduzida.
- `0029`: **+0** — nenhum novo entrypoint (apenas ajustes internos das edges já existentes).

## 10. Confirmações
- EDGE-A/A2/B/C não foram reabertos.
- RLS/policies/cutover/NOT NULL não foram alterados.
- Projeto FER original não foi alterado.
