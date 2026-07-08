# 05 — Checklist de Onboarding (Casa Piloto)

Objetivo: colocar a casa em operação assistida em até **10 dias úteis** a partir
da assinatura do Termo.

---

## Fase 0 — Pré-implantação (D-3 a D0)

- [ ] Termo de Adesão assinado (`02-termo-adesao-saas.md`).
- [ ] Anexo LGPD assinado (`03-anexo-lgpd.md`).
- [ ] Pagamento do setup / 1ª mensalidade confirmado (`08-plano-cobranca.md`).
- [ ] Pontos focais da Casa definidos (1 admin + 1 operacional).
- [ ] Dados institucionais coletados: razão social, CNPJ, endereço, logo, cores.

## Fase 1 — Provisionamento (D+1)

- [ ] Criação do **tenant** isolado da Casa no Portal.
- [ ] Cadastro dos dados institucionais (`instituicao_config`).
- [ ] Criação do primeiro **Administrador** da Casa (senha temporária + reset).
- [ ] Ativação da MFA para o administrador principal.
- [ ] Configuração das **cores** e logo (identidade visual da Casa).
- [ ] Validação de login e reset de senha ponta a ponta.

## Fase 2 — Configuração operacional (D+2 a D+4)

- [ ] Cadastro de perfis funcionais internos (coordenadores, entrevistadores,
      tarefeiros) via **fluxo de aprovação administrativa**.
- [ ] Cadastro das **modalidades de tratamento** da Casa.
- [ ] Cadastro da **programação padrão** (dias/horários).
- [ ] Cadastro das **funções de voluntariado** utilizadas pela Casa.
- [ ] Revisão das **regras operacionais** (limites, exceções, quorum).
- [ ] Configuração dos **comprovantes** e cartas.

## Fase 3 — Comunicação (opcional, D+4 a D+6)

- [ ] Configuração do WhatsApp institucional (Z-API), se a Casa optar.
- [ ] Revisão dos templates de mensagem e do texto de consentimento.
- [ ] Teste ponta-a-ponta de opt-in / opt-out.

## Fase 4 — Treinamento (D+5 a D+7)

- [ ] Execução do treinamento inicial (`06-roteiro-treinamento.md`).
- [ ] Distribuição do acesso à Central de Ajuda.
- [ ] Confirmação de leitura da Política de Suporte (`04-politica-suporte.md`).

## Fase 5 — Piloto (D+7 a D+90)

- [ ] Início do uso operacional real (sem migração automática de bases legadas).
- [ ] Reuniões quinzenais de acompanhamento.
- [ ] Registro de bugs e melhorias em canal oficial.
- [ ] Avaliação parcial em D+30 e D+60.

## Fase 6 — Conclusão

- [ ] Avaliação final (`10-criterios-aceite.md`).
- [ ] Decisão: continuar em produção regular, renovar piloto ou encerrar.
- [ ] Em caso de encerramento: exportação CSV entregue e eliminação em até 30
      dias.
