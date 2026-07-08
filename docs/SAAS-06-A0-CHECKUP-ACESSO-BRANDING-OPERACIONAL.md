# SAAS-06-A0 — Check-up de acesso, branding e entendimento operacional

Status: **Concluído**
Data: 2026-07-08
Predecessor: SAAS-06-A (Kit de Produção Assistida)

## 1. Objetivo

Preparar o SaaS para oferta comercial a casas piloto, garantindo que:

- Nenhuma superfície pública (login, cadastro, MFA, meta tags) traga o branding
  “Tratamentos FER”.
- O proprietário da plataforma tenha acesso `platform_owner` idempotente.
- Exista uma estratégia clara e documentada de branding global (pré-login) vs.
  branding por instituição (pós-login).
- O tenant `Casa Espírita Demo` continue disponível para demonstração.
- O projeto Tratamentos FER original permaneça 100% intocado.

## 2. Origem do branding “Tratamentos FER”

Diagnóstico executado nas superfícies pré-login e globais:

| Origem | Arquivo | Situação anterior |
| --- | --- | --- |
| Componente hardcoded | `src/pages/Login.tsx` | Título "Tratamentos FER", subtítulo, tagline "Harmonia · Equilíbrio · Renovação", `fer-icon.png` |
| Componente hardcoded | `src/pages/SolicitarCadastro.tsx` | `fer-icon.png` como logo, `alt="Tratamentos FER"` |
| Componente hardcoded | `src/pages/MfaVerify.tsx` | `fer-icon.png` como logo, `alt="Tratamentos FER"` |
| Componente hardcoded | `src/pages/SegurancaConta.tsx` | Cabeçalho do arquivo de recuperação com "Tratamentos FER" e nome `codigos-recuperacao-fer.txt` |
| Meta tags do documento | `index.html` | `<title>`, `<meta description>`, `og:title`, `apple-mobile-web-app-title`, `twitter:title` referenciando "Tratamentos FER" |
| Asset | `src/assets/fer-icon.png` | Logo específico da FER usado como marca global |

**Não** havia herança via `configuracoes_gerais`, seed do banco, variável de
ambiente ou fallback dinâmico. Todas as ocorrências eram literais em código.

## 3. Alterações aplicadas

### 3.1 Config central de branding global

Criado `src/config/saasBranding.ts`, fonte única para todas as superfícies
pré-login:

```
Portal Casa Espírita
Gestão espiritual, assistencial e administrativa para casas espíritas
Acolhimento · Organização · Renovação
Uma plataforma SC Moreira Tech
```

### 3.2 Asset neutro

Adicionado `src/assets/portal-casa-espirita-icon.png` (lótus radiante em teal /
sage). O antigo `fer-icon.png` **não foi apagado** — permanece disponível para
uso pelo eventual tenant FER futuro, se autorizado.

### 3.3 Superfícies atualizadas

- `src/pages/Login.tsx` — logo, título, subtítulo, tagline e assinatura de
  rodapé agora consomem `SAAS_BRANDING`.
- `src/pages/SolicitarCadastro.tsx` — logo/alt neutros.
- `src/pages/MfaVerify.tsx` — logo/alt neutros.
- `src/pages/SegurancaConta.tsx` — cabeçalho do TXT de códigos de recuperação
  neutro e nome de arquivo genérico `codigos-recuperacao.txt`.
- `index.html` — `<title>`, `<meta description>`, `og:*`, `twitter:*`,
  `apple-mobile-web-app-title` e `author` neutros.

## 4. Estratégia de branding

### 4.1 Global (pré-login e superfícies neutras)

Fonte única: `src/config/saasBranding.ts`. Nenhuma superfície pré-login pode
referenciar tenants específicos. Toda edição de nome/tagline/assinatura acontece
neste arquivo.

### 4.2 Por instituição (pós-login)

Após autenticação e seleção de instituição, o branding passa a ser
tenant-aware, consumido de `instituicao_config` via `InstituicaoContext`:

- `nome_fantasia`, `slug`, logo, cores e textos institucionais.
- Casas contratantes veem apenas a sua própria identidade.
- Um eventual tenant FER (não este) poderá usar “Tratamentos FER” como
  branding interno, **sem** contaminar a superfície global.

### 4.3 Regras invariantes

- **INV-BRAND-01**: nenhuma superfície pré-login pode citar tenant específico.
- **INV-BRAND-02**: `SAAS_BRANDING` é a única fonte para o branding global.
- **INV-BRAND-03**: assets legados de tenants não podem ser referenciados como
  marca da plataforma; podem apenas ser referenciados por tenant.

## 5. Acesso `platform_admin` do proprietário

Migração `20260708150000_saas06a0_seed_platform_owner.sql`:

- Seed idempotente: se `saulocmoreira@gmail.com` já existe em `auth.users`,
  cria linha em `public.platform_admins` com papel `platform_owner`.
- Trigger `AFTER INSERT` em `auth.users`: promove automaticamente esse e-mail
  no próximo signup, também idempotente (`ON CONFLICT DO NOTHING`).
- Nenhuma tabela nova. Nenhuma RLS/policy alterada.
- Nenhum acesso criado no projeto FER original (migração aplicada apenas neste
  projeto SaaS).

**Instrução operacional**: quando o proprietário fizer o primeiro login neste
SaaS com o e-mail acima, ele passa automaticamente a `platform_owner` e ganha
acesso ao Portal Admin (`/portal/admin`).

## 6. Tenant demo

Validado em consulta direta: `Casa Espírita Demo` (slug `casa-demo`, status
`ativa`) permanece disponível. Nenhum dado real da FER foi copiado. Módulos
ativos e dados sintéticos continuam conforme SAAS-05-F2.

## 7. Fluxo operacional documentado

1. `/login` (branding global — Portal Casa Espírita).
2. Autenticação (MFA quando aplicável).
3. `/portal` → seleção de instituição (`InstituicaoContext`).
4. `/dashboard` (branding tenant-aware).
5. Módulos operacionais autorizados pelo plano/perfil:
   - Tratamentos, Assistidos, Voluntários, Agenda, Entrevistas, Presença,
     Sessões Públicas, Ação Social, Campanhas, Eventos, Comunicação, Relatórios,
     Configurações.
6. Áreas administrativas globais (somente `platform_owner`/`platform_admin`):
   - `/portal/admin`, `/portal/instituicoes`, `/portal/modulos`.

## 8. Preservação do projeto FER original

- Nenhuma alteração aplicada no projeto Tratamentos FER original.
- Nenhum dado real da FER foi copiado, migrado ou referenciado.
- Nenhum tenant FER real foi criado neste SaaS.
- Assets `fer-icon.png` continuam disponíveis apenas como material herdado, sem
  papel global.

## 9. Testes executados

Nova suíte de governança: `src/test/governanca/saas06a0-checkup-acesso-branding.test.ts`.

Cobertura:

- Branding neutro em Login/Cadastro/MFA.
- Ausência de menções a “Tratamentos FER” nas superfícies globais.
- Config central `SAAS_BRANDING`.
- Meta tags neutras em `index.html`.
- Migração idempotente de `platform_owner`.
- Existência do documento oficial e do asset neutro.
- Preservação de assets legados da FER.

## 10. Pendências antes da primeira casa piloto

1. Confirmar o primeiro signup do proprietário (`saulocmoreira@gmail.com`)
   para acionar a trigger e ganhar acesso ao Portal Admin.
2. Configurar branding tenant-aware para a primeira casa piloto (nome, logo,
   cores) via `instituicao_config`.
3. Validar visualmente Login, Cadastro e MFA em preview publicado.
4. Executar checklist de onboarding do SAAS-06-A com o cliente piloto.

## 11. Indicadores

| Indicador | Delta A0 |
| --- | --- |
| 0028 | +0 |
| 0025 | +0 |
| 0029 | +0 |

## 12. Conclusão

SAAS-06-A0 formalmente encerrado. Login neutro/comercial, acesso
`platform_owner` idempotente para o proprietário, estratégia de branding
tenant-aware documentada, tenant demo validado, projeto FER original intocado.
