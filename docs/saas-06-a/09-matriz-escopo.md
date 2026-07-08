# 09 — Matriz de Escopo (Incluso × Fora)

## Incluído no piloto assistido

### Plataforma
- Tenant isolado, com RLS multi-tenant certificada (SAAS-05-F3/G/H/I).
- Backups gerenciados pela infraestrutura e point-in-time recovery da plataforma.
- Auditoria de operações sensíveis (`audit_logs` com JSON-diff).
- MFA opcional para administradores.
- Aprovação administrativa de novos cadastros de usuários.

### Módulos funcionais
- Cadastro de **assistidos** com padrão cadastral (CPF, ViaCEP, e-mail, fotos).
- **Agenda** e **presenças** (fonte única `agenda_tratamentos_assistido`).
- **Tratamentos** (modos Livre, Sequencial e Data Inicial) e liberação sequencial.
- **Entrevistas** (fluxo operacional, assistente IA, sigilo das notas).
- **Exceções** operacionais e avisos internos realtime.
- **Voluntariado** com Termo de Adesão automatizado.
- **Comunicação institucional** (comunicados, campanhas, eventos, ação social).
- **WhatsApp institucional** com consentimento LGPD auditado (opcional).
- **IA de apoio** (sugestões de entrevista, imagens de campanha, WhatsApp) sujeita
  a cota do plano piloto.
- **Relatórios e dashboards** por perfil, com exportação CSV.
- **Central de Ajuda** por papel.

### Serviços humanos
- Provisionamento e configuração inicial do tenant.
- Treinamento inicial (3 encontros, ~5h30) conforme `06-roteiro-treinamento.md`.
- Suporte assistido em horário comercial (`04-politica-suporte.md`).
- Reuniões quinzenais de acompanhamento.
- Correção priorizada de bugs relevantes durante o piloto.

## Fora de escopo

### Comercial / plataforma
- Venda self-service e checkout automático (Stripe/Paddle).
- Cobrança recorrente automática (durante o piloto é 100% manual).
- Página pública de vendas / landing SaaS.
- White-label profundo (domínio próprio, e-mails de auth do domínio da Casa).
- Multi-idioma.

### Dados
- Migração automática de bases legadas (FER, planilhas, outros sistemas).
  Pode ser combinada como **serviço à parte**, com escopo próprio.
- Alteração do projeto **Tratamentos FER** original: expressamente **intocado**.

### Suporte
- SLA contratual com penalidades. Suporte é **best-effort assistido**.
- Atendimento 24×7.
- Treinamentos avançados ou individualizados fora dos 3 encontros previstos.

### Funcional
- Customizações exclusivas de layout, fluxo ou regra de negócio da Casa.
- Integrações com sistemas de terceiros (ERP, contabilidade, folha).
- Aplicativo mobile nativo (a plataforma é PWA instalável).
- Assinatura eletrônica com validade jurídica ICP-Brasil.

## Área cinza (avaliada caso a caso)

- Importação **manual assistida** de uma base pequena de assistidos (até X
  registros), como serviço adicional.
- Ajustes visuais leves (tema, cores, logo) — inclusos.
- Ajustes de texto padrão em comprovantes e termos — inclusos, dentro do
  razoável.
