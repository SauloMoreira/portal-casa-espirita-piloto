# SAAS-06-C1-FIX09-GLOBAL — Varredura de RLS, tenantização e erros amigáveis

## Objetivo
Padronizar, em todas as áreas do sistema com escrita tenantizada, o acesso do
`admin_instituicao` **sem depender do GUC `app.current_instituicao`** e garantir
que nenhum erro técnico bruto chegue ao usuário final.

## Tabelas tenantizadas auditadas

Cada tabela abaixo passou a ter, além da policy `shadow_tenant_all_<tabela>`
(que exige GUC de sessão), uma policy explícita
`admin_instituicao gerencia <tabela> do tenant`, usando a função
`fn_is_admin_instituicao(auth.uid(), instituicao_id)` — SECURITY DEFINER, que
valida vínculo **ativo** + papel `admin_instituicao`.

| Tabela                          | Policy FIX09-GLOBAL |
| ------------------------------- | ------------------- |
| assistidos                      | ✅ (FIX08)          |
| voluntarios                     | ✅ (FIX04)          |
| sessoes_publicas                | ✅ (FIX09)          |
| acao_social_alimentos           | ✅ (FIX09-GLOBAL)   |
| avisos_internos                 | ✅ (FIX09-GLOBAL)   |
| campanhas                       | ✅ (FIX09-GLOBAL)   |
| comunicacoes_institucionais     | ✅ (FIX09-GLOBAL)   |
| configuracoes_gerais            | ✅ (FIX09-GLOBAL)   |
| eventos                         | ✅ (FIX09-GLOBAL)   |
| excecoes_operacionais           | ✅ (FIX09-GLOBAL)   |
| palestras                       | ✅ (FIX09-GLOBAL)   |
| programacao_padrao              | ✅ (FIX09-GLOBAL)   |
| regras_operacionais             | ✅ (FIX09-GLOBAL)   |

Todas as policies:
- Escopo: `TO authenticated`.
- USING e WITH CHECK: `fn_is_admin_instituicao(auth.uid(), instituicao_id)`.
- **Cross-tenant impossível** — a função exige match exato de `instituicao_id`.
- Nenhum acesso a `anon` ou `PUBLIC` foi criado.
- Nenhuma policy existente foi afrouxada; apenas foi **adicionada** uma segunda
  policy permissiva restrita ao admin da própria instituição.

## Helper de erros amigáveis

`src/lib/supabaseFriendlyErrors.ts` cobre:

| Situação                        | Mensagem                                                              | Código sufixo |
| ------------------------------- | --------------------------------------------------------------------- | ------------- |
| RLS / 42501                     | "Você não possui permissão para executar esta operação..."            | `_DENIED`     |
| Tenant ausente                  | "Não foi possível identificar a instituição atual..."                 | `TENANT_AUSENTE` |
| Duplicidade / 23505             | "Já existe um cadastro com essas informações."                        | `_DUPLICATE`  |
| Campo obrigatório / 23502/23514 | "Preencha os campos obrigatórios antes de continuar."                 | `_REQUIRED`   |
| FK / 23503                      | "Não foi possível concluir a ação porque há informações relacionadas..." | `_FK`      |
| Inesperado                      | "Não foi possível concluir esta ação no momento..."                   | `_UNEXPECTED` |

Prefixos padronizados por entidade (`ASSISTIDOS`, `VOLUNTARIOS`,
`SESSOES_PUBLICAS`, `SOLICITACOES_COMERCIAIS`, etc.) e formato
`<PREFIX>_<ACAO>_<SUFIXO>` — ex.: `SESSOES_PUBLICAS_INSERT_DENIED`.

## Escopo NÃO alterado
- Módulos, planos e assinaturas.
- Projeto Tratamentos FER original (fora do SaaS).
- Superfícies globais (governança, portal, platform_admin).
- Nenhum bypass novo, nenhum SECURITY DEFINER novo, nenhum grant a `anon`.

## Próximas ondas
- Onda 2: aplicar `toFriendlyError` nas telas restantes que ainda usam
  `error.message` direto em toast (Eventos, Campanhas, Comunicação, Ação Social).
- Onda 3: Central de Chamados completa (FIX10), substituindo o stub atual.
