# SAAS-06-B0.2 — Auditoria e Recorte Comercial de Módulos

## Objetivo

Alinhar a Central de Assinaturas e o Portal Casa Espírita ao **conceito
comercial oficial** de módulo, evitando que funcionalidades internas do
módulo Tratamentos apareçam como módulos comerciais independentes.

## Conceito aprovado

- **Módulo comercial** = unidade contratável do SaaS, com liberação
  controlada por plano/assinatura.
- **Funcionalidade interna** = recurso dentro de um módulo comercial, com
  acesso controlado por **papel/perfil** do usuário — não por assinatura.

## Módulos comerciais oficiais

| Código               | Nome                  | Status atual        |
| -------------------- | --------------------- | ------------------- |
| `tratamentos`        | Tratamentos           | ativo, principal    |
| `caixa`              | Caixa / Cantina       | futuro              |
| `biblioteca`         | Biblioteca            | futuro              |
| `portal`             | Portal Institucional  | futuro (site da casa) |
| `financeiro`         | Financeiro            | futuro              |

> O código `portal` refere-se ao **site institucional** da casa (futuro
> módulo comercial), **não** ao autoatendimento do assistido — este é
> funcionalidade interna de Tratamentos.

## Estrutura interna do módulo Tratamentos

O módulo Tratamentos é **único e completo**. Inclui internamente, sem gerar
módulos comerciais separados:

- assistidos;
- entrevistas fraternas;
- agenda de tratamentos e de entrevistas;
- tratamentos e planos de tratamento;
- presença;
- avisos de ausência;
- lista de espera / coordenação;
- voluntários e funções de voluntariado;
- palestras;
- sessões públicas / check-in público;
- regras operacionais;
- programação padrão;
- exceções operacionais;
- relatórios operacionais;
- comunicação institucional operacional;
- WhatsApp (quando aplicável);
- Central IA de apoio (quando aplicável);
- autoatendimento do assistido (painel, agenda, docs, perfil).

## Regra para planos e assinaturas

Planos liberam **módulos comerciais**, não funcionalidades internas.

| Plano                 | Módulos liberados                                                              |
| --------------------- | ------------------------------------------------------------------------------ |
| `producao_assistida`  | Tratamentos                                                                    |
| `essencial`           | Tratamentos, Portal Institucional                                              |
| `fraterno`            | Tratamentos, Portal Institucional, Biblioteca                                  |
| `completo`            | Tratamentos, Portal Institucional, Biblioteca, Caixa/Cantina, Financeiro       |
| `enterprise`          | Todos os módulos                                                               |

## Controle interno por perfil

Dentro do módulo Tratamentos, o acesso a cada funcionalidade continua
sendo definido por papel/perfil:

- admin local (`admin_instituicao`);
- coordenador;
- entrevistador;
- tarefeiro/voluntário;
- assistido.

**Nunca** usar assinatura para quebrar artificialmente funcionalidades
internas de Tratamentos.

## Recomendação para FER Piloto

Habilitar inicialmente apenas o módulo **Tratamentos** (plano
`producao_assistida`). Os demais módulos podem aparecer como:

- "em breve";
- "não incluso no plano";
- "futuro módulo".

Sem gerar erro operacional.

## Impacto de código / dados

Migração `saas06b02_auditoria_modulos.sql`:

- renomeia `caixa` → **Caixa / Cantina**;
- renomeia `portal` → **Portal Institucional**;
- atualiza descrição de `tratamentos` explicitando as funcionalidades
  internas;
- adiciona módulo `financeiro`;
- adiciona plano `producao_assistida` com apenas `tratamentos`;
- adiciona `financeiro` aos planos `completo` e `enterprise`.

Ajuste em `src/hooks/usePortalHub.ts`:

- `MODULO_ROTA.portal` passa a `null` (Portal Institucional é futuro; o
  autoatendimento do assistido não é módulo comercial);
- inclui `financeiro: null` em `MODULO_ROTA`.

## Testes

Cobertura em `src/test/governanca/saas06b02-auditoria-modulos.test.ts`:

- Tratamentos é módulo comercial único;
- Agenda / Entrevistas / Presença / Relatórios / Comunicação / Central IA
  **não** aparecem como códigos de módulo comercial;
- Caixa/Cantina, Biblioteca, Portal Institucional e Financeiro aparecem
  como módulos comerciais futuros (sem rota);
- Apenas Tratamentos tem rota mapeada em `MODULO_ROTA`;
- Documento presente.

## Fora do escopo

- Não altera o projeto **Tratamentos FER** original.
- Não migra dados reais.
- Não altera cobrança, RLS, policies, RPCs ou edges.

## Indicadores (delta SAAS-06-B0.2)

- 0028: 0 · 0025: 0 · 0029: 0.
