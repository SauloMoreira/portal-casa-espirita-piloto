## Objetivo
Corrigir dois comportamentos de frontend: (1) mensagens de erro no login em inglês e (2) e-mail não exibido corretamente no Meu Perfil.

## 1. Mensagens de erro do login em português

**Problema:** `src/pages/Login.tsx` exibe `error?.message` diretamente. O backend retorna textos em inglês ("Invalid login credentials", "Email not confirmed", etc.).

**Solução:** Criar função utilitária `traduzirErroAuth(mensagem)` que mapeia erros conhecidos para português com tolerância a variações (uso de `includes` quando aplicável).

Mapeamentos:
- "Invalid login credentials" → "E-mail ou senha incorretos."
- "Email not confirmed" → "E-mail ainda não confirmado."
- "User not found" → "Usuário não encontrado."
- Rate limit / excesso de tentativas → "Muitas tentativas. Aguarde alguns instantes e tente novamente."
- Fallback genérico → "Não foi possível entrar. Verifique suas credenciais e tente novamente."

**Arquivo:** `src/pages/Login.tsx` (catch do handleSubmit). Opcional: criar `src/lib/authErrors.ts` como helper reutilizável.

## 2. Exibir corretamente o e-mail no Meu Perfil

**Problema:** `src/pages/MeuPerfil.tsx` preenche o e-mail apenas de `assistido.email`, que pode estar vazio.

**Solução:** Prioridade de preenchimento: usar `assistido.email` quando preenchido; caso contrário, fallback para `user?.email` (da conta autenticada via `useAuth`). O campo continua somente leitura.

**Arquivo:** `src/pages/MeuPerfil.tsx` (efeito de carregamento do perfil).

## Regras
- Sem alteração de banco, autenticação, permissões ou regra de negócio.
- Sem novas dependências.
- Helper pequeno, coeso, sem dependências externas.

## Validação
- Login com senha errada → mensagem em português.
- Login com e-mail não confirmado → mensagem em português.
- Rate limit → mensagem em português.
- Perfil com `assistido.email` vazio → exibe `user.email`.
- Perfil com `assistido.email` preenchido → exibe `assistido.email`.
- Typecheck e build limpos; testes passando.
