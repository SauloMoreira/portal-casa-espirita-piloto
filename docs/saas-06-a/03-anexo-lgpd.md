# 03 — Anexo LGPD / Tratamento de Dados

Parte integrante do Termo de Adesão SaaS (`02-termo-adesao-saas.md`).

---

## 1. Papéis

- **Controlador:** a Casa Espírita contratante. Define as finalidades e coleta os
  dados dos assistidos, voluntários e demais titulares.
- **Operador:** o Portal Casa Espírita. Trata os dados **exclusivamente** para
  cumprir as instruções da Casa e viabilizar o serviço.
- **Subperadores:** infraestrutura de nuvem (Lovable Cloud / Supabase gerenciado),
  provedor de mensageria (Z-API) quando habilitado pela Casa, gateway de IA
  (Lovable AI Gateway) quando habilitado.

## 2. Categorias de dados tratados

- **Cadastrais:** nome, CPF, contatos, endereço, foto.
- **Sensíveis (art. 11 LGPD):** dados relativos à saúde e crenças, quando a Casa
  optar por registrá-los nas entrevistas e tratamentos.
- **Operacionais:** agenda, presenças, tratamentos, avisos.
- **Autenticação:** e-mail, hash de senha, MFA (quando ativado).
- **Comunicação:** mensagens WhatsApp trocadas via canal institucional, quando
  habilitado pela Casa.

## 3. Base legal

- **Execução de contrato / procedimentos preliminares** (para dados cadastrais
  e operacionais dos usuários funcionais).
- **Consentimento** explícito e revogável para envio de mensagens WhatsApp
  (fluxo já implementado no sistema com opt-in / opt-out auditados).
- **Tutela da saúde e proteção da vida** e/ou consentimento específico para
  dados sensíveis de saúde, conforme a natureza da atividade.

## 4. Finalidades

- Gestão operacional da casa (agenda, presença, tratamentos, comunicação
  institucional, voluntariado, relatórios).
- Suporte técnico e correção de erros.
- Segurança da informação e auditoria.

## 5. Direitos dos titulares

A Casa é responsável por atender às requisições dos titulares (art. 18 LGPD):
acesso, correção, anonimização, portabilidade, eliminação e revogação de
consentimento. O Portal oferece funcionalidades para viabilizar essas ações
(edição, soft delete, exportação CSV, opt-out de WhatsApp).

## 6. Segurança

- Autenticação com senha + MFA opcional para administradores.
- Isolamento **multi-tenant** com RLS obrigatória em todas as tabelas de dados
  de negócio (SAAS-05-F3).
- Backups gerenciados pela plataforma; point-in-time recovery dentro da janela
  do plano.
- Auditoria (`audit_logs`) das operações sensíveis, com JSON diff.
- Segredos e chaves privadas mantidos fora do frontend.

## 7. Incidentes

7.1. O Portal notifica a Casa em até **72 horas** ao tomar conhecimento de
incidente de segurança que possa causar risco relevante aos titulares.
7.2. A comunicação à ANPD e aos titulares é responsabilidade do **Controlador**
(a Casa), com apoio técnico do Portal.

## 8. Subcontratação

A Casa autoriza a subcontratação dos operadores listados em §1. Novos
subperadores relevantes serão comunicados com antecedência mínima de 15 dias.

## 9. Retenção e eliminação

- Durante o contrato: retenção pelo tempo necessário à operação.
- Após o encerramento: exportação disponibilizada e eliminação em até **30 dias
  corridos**, salvo obrigação legal de guarda.

## 10. Encarregado (DPO)

A Casa deve indicar seu Encarregado. O Portal indica canal `[dpo@portal.casa]`
(a preencher) para tratativas técnicas com o operador.
