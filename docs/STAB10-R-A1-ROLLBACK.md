# SAAS-06-C1-STAB10-R-A1 — Rollback (não executado)

Documento operacional para desfazer a data-fix STAB10-R-A1 caso seja necessário.
Não executar sem aprovação humana explícita.

## Escopo

Reverter, e somente reverter, as escritas feitas por STAB10-R-A1:
- 3 linhas em `public.instituicao_usuarios` (FER Piloto, papel `assistido`, status `ativo`).
- 1 UPDATE em `public.profiles` (R3-A: `Assistido 03` → `Assistido02`).
- 3 linhas em `public.audit_logs` com `acao = 'STAB10R_RECONCILIACAO_VINCULO_ASSISTIDO'`.

## IDs conhecidos

| Registro | user_id | instituicao_usuarios.id | audit_logs.registro_id |
|---|---|---|---|
| R1  | 18e2dceb-48ba-471d-ae9d-da52ef23865a | 39136ab5-9292-435f-801a-b335b9ab03dc | 39136ab5-9292-435f-801a-b335b9ab03dc |
| R2  | 2a11e218-ea17-4e67-b92a-c1b1fdfdb3d7 | 28c4accf-b4c7-4bf0-8fdf-6035ad64bd70 | 28c4accf-b4c7-4bf0-8fdf-6035ad64bd70 |
| R3-A| a8e77eff-0e83-48aa-9f0e-a41c8c28f0c6 | 273ce533-dffa-4f8c-a031-35e0d68450d1 | 273ce533-dffa-4f8c-a031-35e0d68450d1 |

Instituição FER Piloto: `e3818702-cfac-47ae-b751-cb6a05babd4f`.
(A coluna `audit_logs.registro_id` aponta para o `instituicao_usuarios.id` correspondente. Como o `id` do audit_log foi gerado internamente, para o rollback filtrar por `(acao, tabela, user_id)` no bloco abaixo.)

## Bloco SQL de rollback (transacional, com precondições)

```sql
DO $$
DECLARE
  v_fer uuid := 'e3818702-cfac-47ae-b751-cb6a05babd4f';
  v_r1_uid uuid := '18e2dceb-48ba-471d-ae9d-da52ef23865a';
  v_r2_uid uuid := '2a11e218-ea17-4e67-b92a-c1b1fdfdb3d7';
  v_r3_uid uuid := 'a8e77eff-0e83-48aa-9f0e-a41c8c28f0c6';
  v_r1_iu  uuid := '39136ab5-9292-435f-801a-b335b9ab03dc';
  v_r2_iu  uuid := '28c4accf-b4c7-4bf0-8fdf-6035ad64bd70';
  v_r3_iu  uuid := '273ce533-dffa-4f8c-a031-35e0d68450d1';
  v_tmp int;
BEGIN
  -- Precondições: vinculos existem exatamente como criados
  PERFORM 1 FROM public.instituicao_usuarios
    WHERE id = v_r1_iu AND user_id = v_r1_uid AND instituicao_id = v_fer
      AND papel_local = 'assistido' AND status = 'ativo' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROLLBACK R1: vinculo divergente'; END IF;
  PERFORM 1 FROM public.instituicao_usuarios
    WHERE id = v_r2_iu AND user_id = v_r2_uid AND instituicao_id = v_fer
      AND papel_local = 'assistido' AND status = 'ativo' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROLLBACK R2: vinculo divergente'; END IF;
  PERFORM 1 FROM public.instituicao_usuarios
    WHERE id = v_r3_iu AND user_id = v_r3_uid AND instituicao_id = v_fer
      AND papel_local = 'assistido' AND status = 'ativo' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROLLBACK R3A: vinculo divergente'; END IF;
  PERFORM 1 FROM public.profiles
    WHERE user_id = v_r3_uid AND nome_completo = 'Assistido 03' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROLLBACK R3A: profile.nome_completo divergente'; END IF;

  -- Reverter escritas
  DELETE FROM public.instituicao_usuarios WHERE id IN (v_r1_iu, v_r2_iu, v_r3_iu);
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  IF v_tmp <> 3 THEN RAISE EXCEPTION 'ROLLBACK: DELETE iu afetou % linhas', v_tmp; END IF;

  UPDATE public.profiles SET nome_completo = 'Assistido02', updated_at = now()
    WHERE user_id = v_r3_uid AND nome_completo = 'Assistido 03';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  IF v_tmp <> 1 THEN RAISE EXCEPTION 'ROLLBACK: UPDATE profile afetou % linhas', v_tmp; END IF;

  DELETE FROM public.audit_logs
    WHERE acao = 'STAB10R_RECONCILIACAO_VINCULO_ASSISTIDO'
      AND tabela = 'instituicao_usuarios'
      AND user_id IN (v_r1_uid, v_r2_uid, v_r3_uid)
      AND registro_id IN (v_r1_iu, v_r2_iu, v_r3_iu);
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  IF v_tmp <> 3 THEN RAISE EXCEPTION 'ROLLBACK: DELETE audit afetou % linhas', v_tmp; END IF;
END $$;
```

## Verificação pós-rollback

- `SELECT count(*) FROM instituicao_usuarios WHERE user_id IN (R1, R2, R3-A)` → deve retornar 0.
- `SELECT nome_completo FROM profiles WHERE user_id = R3-A` → deve retornar `Assistido02`.
- Nenhum `assistidos.user_id` deve ter mudado.
- Portal deve voltar a exibir `ASSISTIDO_SEM_VINCULO_INSTITUCIONAL` para os três.
