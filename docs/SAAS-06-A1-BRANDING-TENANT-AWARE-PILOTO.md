# SAAS-06-A1 — Branding tenant-aware e onboarding visual da primeira casa piloto

> Status: **CONCLUÍDO**  ·  Escopo: branding por instituição + fallback global + checklist da primeira casa piloto.
> Premissa: **nenhuma alteração no projeto Tratamentos FER original** e nenhuma migração de dados reais.

---

## 1. Estratégia de branding

O Portal Casa Espírita opera com duas camadas de branding:

| Camada | Onde aparece | Fonte | Fallback |
| ------ | ------------ | ----- | -------- |
| **Global (neutro/comercial)** | Login, cadastro, MFA, recuperação, área não autenticada | `src/config/saasBranding.ts` | — |
| **Por tenant** | Portal, seletor de instituição, dashboard, cabeçalho interno, cards de módulo, páginas institucionais, painéis por módulo | `instituicao_config` (RLS-scoped) + `instituicoes.nome` | Global |

Regra crítica: o branding do tenant **só aparece após autenticação e resolução/seleção da instituição ativa** pelo `InstituicaoContext`. Sem instituição ativa → sempre branding global. Nunca "Tratamentos FER" como padrão global; nunca branding de outro tenant.

## 2. Campos suportados por tenant

Adicionados de forma aditiva e opcional em `public.instituicao_config` (nullable, sem alterar RLS):

- `nome_fantasia` (já existente)
- `logo_url` (já existente)
- `slogan`
- `cor_primaria`
- `cor_secundaria`
- `texto_institucional`
- `assinatura_rodape`

Todos são opcionais. Ausência → hook de branding preenche com valores neutros de `SAAS_BRANDING`.

## 3. Camada de composição — `useTenantBranding()`

`src/hooks/useTenantBranding.ts` consolida:

1. `useInstituicaoAtiva()` → tenant selecionado (fail-closed, respeita `allowedIds`).
2. Leitura tenant-scoped de `instituicao_config` via cliente autenticado (RLS já filtra).
3. Fallback para `SAAS_BRANDING` (Portal Casa Espírita) quando não há tenant ativo, quando a leitura falha, ou quando o campo específico está vazio.

Retorna sempre um objeto `TenantBranding` com `scope: "tenant" | "global"`, para os componentes decidirem o rótulo superior sem lógica duplicada.

## 4. Telas impactadas nesta iteração

- `src/pages/Portal.tsx` — cabeçalho passa a exibir nome fantasia, logo e slogan da instituição ativa; sem tenant ativo mantém "Plataforma Casa Espírita" + saudação neutra.
- `src/components/AppSidebar.tsx` — já lia `instituicao_config` tenant-scoped (mantido); continua exibindo logo/nome do tenant ativo, hoje coerente com a nova estratégia.

Demais superfícies (dashboards por perfil, cards de módulo, painéis institucionais) permanecem estáveis; passarão a consumir o hook em iterações futuras conforme a demanda dos pilotos.

## 5. Fallback global

Quando `selecionada === null`:

- `nome` = `SAAS_BRANDING.name` (Portal Casa Espírita)
- `slogan` = `SAAS_BRANDING.tagline`
- `logoUrl` = `null` (UI mostra placeholder neutro)
- `assinaturaRodape` = `SAAS_BRANDING.signature` (Uma plataforma SC Moreira Tech)

Nunca cai para "Tratamentos FER" nem para o branding de outro tenant. Não lê `localStorage` fora do `InstituicaoContext`.

## 6. Tenant Casa Espírita Demo

Seed defensivo na migração `20260708…_saas06a1_branding_tenant_aware.sql`:

- Slogan: `Ambiente de demonstração`
- Texto institucional: `Tenant demo do Portal Casa Espírita. Sem dados reais.`
- Assinatura de rodapé: `Portal Casa Espírita · Casa Espírita Demo`
- Sem uso da marca FER, sem dados reais.

O update é idempotente e aplicado apenas se a instituição `casa-demo` existir e o campo estiver vazio.

## 7. Checklist da primeira casa piloto

Ver `docs/saas-06-a/11-checklist-branding-piloto.md`. Resumo:

- Dados institucionais (nome fantasia, razão social, CNPJ, cidade/UF, contatos).
- Logo (PNG ≥ 512px, fundo transparente ou sólido claro).
- Slogan curto (até ~60 caracteres).
- Cor primária e secundária (hex).
- Texto institucional curto para dashboard/cards.
- Assinatura de rodapé.
- Responsável institucional e admin inicial.
- Módulos ativos e plano.
- Aceite do termo SaaS.

Somente após todos os itens confirmados por escrito é permitido criar o tenant piloto real. **Não** criar tenant FER real. **Não** copiar dados reais.

## 8. Testes executados

Suíte `src/test/governanca/saas06a1-branding-tenant-aware.test.ts`:

- Existência e composição do hook `useTenantBranding`.
- Fallback global quando não há tenant ativo (`scope: "global"`).
- Origem tenant quando há instituição selecionada (`scope: "tenant"`).
- Ausência de menção literal a "Tratamentos FER" no hook e no Portal.
- Portal.tsx consome `useTenantBranding` e usa `SAAS_BRANDING` como rótulo neutro.
- Migração aditiva com os cinco campos opcionais e seed idempotente do tenant demo.
- Existência do documento e do checklist da primeira casa piloto.

## 9. Riscos e pendências

- Ampliar consumo do `useTenantBranding` a dashboards por perfil e cards de módulo (previsto para SAAS-06-A2/A3 conforme demanda dos pilotos).
- Aplicar cores tenant (`cor_primaria`/`cor_secundaria`) como CSS variables dinâmicas (já há motor de temas em `useThemeColors`; a integração explícita com o novo campo fica para próxima iteração para não misturar responsabilidades nesta entrega).
- Ferramenta administrativa para upload de logo e definição de cores por tenant a partir da UI (hoje só pela Configurações/Instituição existente + campos novos aplicáveis via banco).

## 10. Preservação do projeto Tratamentos FER original

- Nenhum arquivo do projeto FER original foi alterado.
- Nenhum dado real da FER foi migrado, copiado ou referenciado.
- Nenhum tenant real da FER foi criado.
- "Tratamentos FER" **não** é usado como marca global do SaaS.

## 11. Indicadores (Delta A1)

- `0028` +0
- `0025` +0
- `0029` +0

Delta isolado atribuível ao SAAS-06-A1: apenas ampliação aditiva de schema (colunas opcionais) e novo hook de composição de branding, sem novos objetos `SECURITY DEFINER` nem alterações em RLS/policies.
