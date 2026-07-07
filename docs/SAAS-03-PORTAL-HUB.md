# SAAS-03 — Portal/Hub inicial da Plataforma Casa Espírita SaaS

**Status:** Concluído
**Escopo:** Camada de entrada SaaS (Portal/Hub) consumindo a fundação criada em SAAS-02. **Não tenantiza tabelas funcionais** (agenda, assistidos, tratamentos, presenças, notificações). Nenhuma alteração no projeto FER original.

---

## 1. Rotas criadas

Todas registradas em `src/constants/routes.ts` e `src/App.tsx`. Servidas pelo `AppLayout` autenticado, sem `allowedRoles` — qualquer usuário logado pode entrar, e a RLS decide o que ele enxerga.

| Rota | Página | Objetivo |
|---|---|---|
| `/portal` | `Portal.tsx` | Home do Hub: saudação, lista de instituições, seleção ativa, cards de módulos, resumo do plano, atalho para visão admin da plataforma. |
| `/portal/instituicoes` | `PortalInstituicoes.tsx` | Lista completa de instituições vinculadas ao usuário. |
| `/portal/modulos` | `PortalModulos.tsx` | Detalhamento dos módulos da instituição selecionada + resumo do plano/assinatura. |
| `/portal/admin` | `PortalAdmin.tsx` | Visão global de instituições, planos e assinaturas — **somente para `platform_admins`**. |

## 2. Fluxo de seleção de instituição

Implementado em `src/hooks/useSelectedInstituicao.ts`.

- Persistência: `sessionStorage` (chave `saas.portal.selectedInstituicaoId`). **Nunca `localStorage`** — a seleção não deve sobreviver ao encerramento do navegador.
- A lista de ids permitidos vem apenas de `usePortalHub` filtrada por `vinculo_status === "ativo"`. O hook:
  - **rejeita** `selectInstituicao(id)` se o id não estiver na lista permitida (retorna `false`);
  - **limpa** automaticamente a seleção quando o id persistido deixa de ser permitido (mudança de vínculo, revogação, etc.);
  - **auto-seleciona** quando há exatamente uma instituição permitida.
- **A seleção é apenas hint de UI**: RLS no backend continua sendo a fonte de verdade. Manipular o sessionStorage no console **não concede acesso**, porque toda leitura passa pelas policies existentes.

## 3. Regras de acesso e exibição

### Instituições
- `usePortalHub` faz `SELECT` em `instituicao_usuarios` filtrando pelo `auth.uid()`. Se o usuário não tem vínculo, retorna vazio.
- Instituições listadas trazem `vinculo_status` (`ativo | pendente | inativo`) e `papel_local`.
- Vínculos não-ativos aparecem, mas com CTA **desabilitado** (badge "Vínculo pendente/inativo").

### Módulos
Estados possíveis (`ModulosGrid.tsx`):

| Estado | Regra |
|---|---|
| `ativo` | vínculo ativo + instituição `ativa`/`implantacao` + assinatura `trial`/`ativa` + módulo incluso no plano + rota implementada. |
| `indisponivel_no_plano` | plano da instituição não inclui o módulo. |
| `em_breve` | plano inclui, mas ainda não existe rota implementada (`biblioteca`, `caixa`). |
| `suspenso` | instituição `suspensa`/`inativa`, vínculo não ativo, assinatura `suspensa`/`cancelada`/`inadimplente`, ou ausência de assinatura. |

Apenas o estado `ativo` renderiza o CTA "Acessar".

### Plano/assinatura (`PlanoResumo.tsx`)
Exibe nome do plano, status da assinatura, `trial_ate`, `data_inicio`, `data_fim`, módulos inclusos. Estados problemáticos (`suspensa`, `cancelada`, `inadimplente`) recebem badge `destructive`.

### Visão platform_admin (`PortalAdmin.tsx`)
- Detecção via `SELECT` em `platform_admins WHERE user_id = auth.uid()` (RLS retorna vazio para não-admins).
- Ao carregar, se `!isPlatformAdmin`, redireciona para `/portal`.
- A defesa real é a RLS: mesmo que a página seja renderizada, `SELECT` em `instituicoes`/`assinaturas` só retorna dados globais para admins de plataforma.

## 4. Comportamento dos módulos

| Módulo | Rota | Comportamento |
|---|---|---|
| Tratamentos | `/tratamentos` | Aponta para a implementação existente. **Sem tenantização** — recorte futuro. |
| Biblioteca | — | Sempre "em breve" no SAAS-03. |
| Caixa | — | Sempre "em breve" no SAAS-03. |
| Portal | `/portal` | Sempre acessível quando a assinatura permite (auto-referência). |

## 5. Testes

- **Contrato (CI, sem banco):** `src/test/governanca/saas03-portal-hub.test.ts`
  - Rotas existem e não exigem `allowedRoles`.
  - Seleção usa `sessionStorage`, limpa inválida, recusa id fora do permitido.
  - Estados de módulo estão declarados e regras de suspenso cobrem instituição/vínculo/assinatura.
  - `biblioteca` e `caixa` sem rota → "em breve".
  - `PortalAdmin` redireciona quando não é `platform_admin`.
  - `usePortalHub` consulta `platform_admins` filtrando por `user_id`.
  - Rota `/tratamentos` preservada.

Cobertura funcional que já é garantida pela **RLS da fundação SAAS-02** (portanto não replicada aqui): isolamento entre tenants, negativa para usuário sem vínculo, negativa para admin de plataforma que não é você. Testes DB reais desses invariantes vivem em `src/test/integration/db/saas02-isolamento-tenants.dbtest.ts`.

## 6. Limitações deste recorte

- Não altera o fluxo global de autenticação. O `AuthContext` continua indiferente ao tenant.
- Não injeta `instituicao_id` em queries do módulo Tratamentos. Clicar em "Acessar Tratamentos" leva ao módulo legado (single-tenant).
- Não implementa gestão CRUD de instituições/planos/assinaturas na visão admin — apenas leitura.
- Não implementa cobrança nem integração com gateway.
- Não integra Biblioteca nem Caixa.

## 7. Confirmações de escopo

- ✅ Nenhuma tabela funcional foi tenantizada.
- ✅ Nenhum dado real da FER foi usado.
- ✅ Projeto FER original **não foi alterado**.
- ✅ Nenhuma edge function alterada.
- ✅ Nenhum dispatcher/provider/notificação alterado.
- ✅ Nenhuma RLS de tabela funcional preexistente alterada.
- ✅ SAAS-02-S2 (hardening médio) **não** foi reaberto.
- ✅ Nenhum finding baixo 0028 tratado.

## 8. Indicadores

| Indicador | Antes do SAAS-03 | Depois do SAAS-03 |
|---|---|---|
| 0028 | 143 | 143 (inalterado) |
| 0025 | 0 | 0 |
| 0029 | 0 | 0 |

O SAAS-03 é 100% frontend + consumo de RLS existente. Nenhuma nova função `SECURITY DEFINER` foi criada.

## 9. Próximos passos

1. **SAAS-02-S3** — hardening baixo (57 funções remanescentes).
2. **SAAS-04** — Header/tenant switcher persistente + `app_metadata.instituicao_ativa`.
3. **SAAS-05** — CRUD administrativo de instituições/planos/assinaturas.
4. **SAAS-06** — Tenantização real do módulo Tratamentos (adicionar `instituicao_id` nas tabelas funcionais e revisar RLS).
