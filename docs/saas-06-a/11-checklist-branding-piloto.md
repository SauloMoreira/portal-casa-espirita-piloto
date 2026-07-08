# Checklist de branding e onboarding — Primeira casa piloto

> Uso: preencher **antes** de criar o tenant real da casa piloto no Portal Casa Espírita.
> Enquanto qualquer item obrigatório estiver pendente, o tenant permanece em `implantacao` e não recebe convites.

## 1. Dados institucionais

- [ ] Nome fantasia (nome público da casa)
- [ ] Razão social
- [ ] CNPJ
- [ ] Cidade / UF
- [ ] E-mail institucional
- [ ] Telefone / WhatsApp institucional
- [ ] Endereço completo (opcional para exibição)

## 2. Identidade visual

- [ ] Logo em PNG (≥ 512×512, preferencialmente fundo transparente)
- [ ] Slogan curto (até ~60 caracteres) — vai para o cabeçalho do Portal
- [ ] Cor primária (hex, contraste AA sobre branco)
- [ ] Cor secundária (hex, opcional)
- [ ] Texto institucional curto (2–3 linhas para cards/dashboard)
- [ ] Assinatura de rodapé (ex.: “Portal Casa Espírita · Nome da Casa”)

## 3. Governança e responsáveis

- [ ] Responsável institucional (nome + contato)
- [ ] Administrador inicial (nome + e-mail para convite)
- [ ] Confirmação de que o administrador inicial aceita atuar como `admin_instituicao`

## 4. Contratação

- [ ] Termo de Adesão SaaS assinado (`docs/saas-06-a/02-termo-adesao-saas.md`)
- [ ] Anexo LGPD aceito (`docs/saas-06-a/03-anexo-lgpd.md`)
- [ ] Plano contratado definido (referência ao catálogo `planos`)
- [ ] Módulos ativos definidos (referência ao catálogo `plano_modulos`)
- [ ] Forma de cobrança inicial acordada (PIX, boleto, link) — sem cobrança automática

## 5. Restrições

- [ ] Nenhum dado real de outra casa foi copiado para este tenant
- [ ] Nenhuma marca “Tratamentos FER” é usada como identidade da casa piloto
- [ ] Nenhum acesso ao projeto Tratamentos FER original foi solicitado ou concedido em nome deste tenant

## 6. Validação pós-provisionamento

- [ ] Login geral continua exibindo “Portal Casa Espírita” (branding global)
- [ ] Após login e seleção da instituição, o Portal exibe nome fantasia, logo e slogan corretos
- [ ] Sidebar exibe logo e nome do tenant
- [ ] Nenhum branding de outra casa aparece para usuários deste tenant
- [ ] Administrador inicial consegue acessar e concluir onboarding operacional (`docs/saas-06-a/05-checklist-onboarding.md`)

Apenas quando **todos** os itens estiverem marcados o tenant piloto pode transitar para status `ativa` e receber convites de operação.
