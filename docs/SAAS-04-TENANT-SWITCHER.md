# SAAS-04 — Tenant switcher persistente e contexto global de instituição

## Objetivo

Consolidar o contexto de instituição ativa no Portal SaaS com:

- Header global exibindo a instituição ativa.
- Tenant switcher seguro (fail-closed) para usuários com múltiplos vínculos.
- Persistência entre sessões (localStorage) e sincronização entre abas.
- Propagação do contexto (via `InstituicaoContext`) para páginas do Portal e
  módulos SaaS futuros — sem duplicar lógica de leitura do hub.

Não altera regra de negócio, não tenantiza tabelas funcionais, não cria
`SECURITY DEFINER`, não muda rotas nem toca no projeto FER original.

## Entregas

### Front-end

1. **`src/hooks/useSelectedInstituicao.ts`** — promovido de `sessionStorage`
   para `localStorage`. Mantém o fail-closed original (descarta seleção fora
   de `allowedIds` e recusa `selectInstituicao(id)` para id não permitido).
   Adiciona listener `storage` para sincronizar entre abas ignorando ids
   não permitidos.
2. **`src/contexts/InstituicaoContext.tsx`** — provider que consolida
   `usePortalHub` + `useSelectedInstituicao` em uma única fonte para o app:

   ```ts
   const {
     isLoading, isError, isPlatformAdmin,
     instituicoes, allowedIds,
     selectedInstituicaoId, selecionada,
     selectInstituicao,
   } = useInstituicaoAtiva();
   ```

   Lança erro claro se usado fora do provider (nunca cai em default
   permissivo).
3. **`src/components/TenantSwitcher.tsx`** — switcher exibido no header:
   - Oculto quando o usuário não possui vínculos.
   - Rótulo estático quando há apenas 1 instituição vinculada.
   - Dropdown quando há ≥ 2 instituições; itens com vínculo diferente de
     `ativo` aparecem desabilitados.
   - Atalho para `/portal`.
4. **`src/components/AppLayout.tsx`** — passa a envolver o app com
   `InstituicaoProvider` e monta `<TenantSwitcher />` no header. O switcher
   não é exibido para o perfil `assistido` (o assistido é um usuário-fim
   sem gestão multi-tenant).
5. **`src/pages/Portal.tsx`** — refatorada para consumir o contexto em vez
   de instanciar os hooks localmente. Passa a ser cliente do
   `InstituicaoContext`.

### Segurança

- **Fail-closed preservado.** A RLS no backend segue como fonte de verdade;
  o contexto é apenas hint de UI.
- Persistência em `localStorage` sob a chave
  `saas.portal.selectedInstituicaoId`. Qualquer valor persistido que não
  esteja em `allowedIds` (calculado a partir de `usePortalHub`) é descartado
  automaticamente.
- Sincronização entre abas (`storage` event) só aceita ids permitidos no
  contexto atual.
- Nenhuma nova função `SECURITY DEFINER`; nenhuma nova migração; nenhuma
  alteração em `GRANT`s.

### Testes

- **`src/test/governanca/saas04-tenant-switcher.test.ts`** — contratos:
  - `localStorage` no lugar de `sessionStorage`.
  - Fail-closed do `useSelectedInstituicao` mantido.
  - Sincronização entre abas via evento `storage` (respeita `allowedIds`).
  - `InstituicaoProvider` + `useInstituicaoAtiva` expostos e consolidam
    `usePortalHub` + `useSelectedInstituicao`.
  - `AppLayout` envolve o app com o provider e monta o switcher no header.
  - `TenantSwitcher` consome apenas o contexto (não instancia hooks).
  - Não exibido para perfil `assistido`.
  - `Portal.tsx` consome o contexto (fonte única no app).
- **`src/test/governanca/saas03-portal-hub.test.ts`** — atualizado: a
  assertiva "persiste em `sessionStorage`" foi promovida para
  "persiste em storage do navegador (localStorage)". Os demais invariantes
  do SAAS-03 permanecem.

### Documentação

- Este arquivo.

## Indicadores

- `0028`: inalterado (nenhuma função `SECURITY DEFINER` criada/alterada).
- `0025`: inalterado.
- `0029`: inalterado.
- `tsgo`: limpo.

## Escopo preservado

- Nenhuma tabela funcional foi tenantizada.
- O módulo Tratamentos não foi alterado.
- O projeto FER original não foi tocado.
- Nenhuma nova migração SQL foi criada.
