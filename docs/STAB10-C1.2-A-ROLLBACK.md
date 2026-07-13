# Rollback — SAAS-06-C1-STAB10-C1.2-A (backend transacional do autocadastro)

Este documento cobre a reversão controlada das três camadas do backend
transacional do autocadastro tenant-aware, na ordem inversa de aplicação.

| Camada | Escopo | Script |
|---|---|---|
| FIX01 | Índice restrito + CHECK de coerência + literais + AUTH_DELETE_NAO_CONFIRMADO | [`sql/rollback-stab10-c12a-fix01.sql`](./sql/rollback-stab10-c12a-fix01.sql) |
| A1 | Hardening base (retomada, concorrência, ROW_COUNT=1) | [`sql/rollback-stab10-c12a-a1.sql`](./sql/rollback-stab10-c12a-a1.sql) |
| Total | Remove FIX01 + A1 + C1.2-A (backend transacional inteiro) | [`sql/rollback-stab10-c12a-total.sql`](./sql/rollback-stab10-c12a-total.sql) |

## Regras de execução

1. **Nunca** rodar em produção sem janela de manutenção.
2. Executar em transação única (`BEGIN`/`COMMIT`) — os scripts já incluem.
3. Precondição para o rollback do FIX01: nenhuma linha viva pode violar o
   predicado antigo do índice. Verificar antes:

   ```sql
   SELECT count(*) FROM public.autocadastro_idempotencia
    WHERE status='reservado' AND user_id IS NOT NULL;
   ```

   Se retornar > 0, sanear (DELETE ou UPDATE user_id=NULL) antes de rodar.
4. A restauração dos corpos das RPCs A1 e C1.2-A é feita reexecutando os
   blocos `CREATE OR REPLACE FUNCTION` das migrations canônicas citadas nos
   scripts (evita duplicar corpo aqui e sair de sincronia).
5. C1.1 (schema/tabela) **não** é revertido por estes scripts.

## Validação pós-rollback

Rodar as suítes específicas para confirmar o comportamento restaurado:

```
bun run test:db  -- autocadastro
bun run test:e2e:rls -- autocadastro-c12a
```

Após rollback do FIX01, esperam-se os testes marcados como `FIX01` FALHANDO
(comportamento esperado) e todos os demais VERDES.
