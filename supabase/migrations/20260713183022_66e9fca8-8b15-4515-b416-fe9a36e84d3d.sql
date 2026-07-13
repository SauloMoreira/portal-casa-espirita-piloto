
DO $$
DECLARE
  v_fer uuid := 'e3818702-cfac-47ae-b751-cb6a05babd4f';
  v_r1_uid uuid := '18e2dceb-48ba-471d-ae9d-da52ef23865a';
  v_r1_aid uuid := 'aef9ab7d-1a51-4ea1-96a1-97e0d2879d8c';
  v_r2_uid uuid := '2a11e218-ea17-4e67-b92a-c1b1fdfdb3d7';
  v_r2_aid uuid := 'ff97a606-6b27-4cb7-baca-68d5f1b78f66';
  v_r3_uid uuid := 'a8e77eff-0e83-48aa-9f0e-a41c8c28f0c6';
  v_r3_aid uuid := 'b4dff918-ef33-4e62-9249-e9dd7e90bb64';
  v_r3b_uid uuid := 'f7112797-3b24-42f3-bd6c-d7e9434e25c0';
  v_r4_uid  uuid := '5945c94f-49a5-4bdb-94a3-b5214bd29139';

  v_r1_iu uuid; v_r2_iu uuid; v_r3_iu uuid;
  v_r3b_snap_nome text; v_r3b_snap_status text; v_r4_snap_status text;
  v_tmp int;
BEGIN
  SELECT nome_completo, status::text INTO v_r3b_snap_nome, v_r3b_snap_status
    FROM public.profiles WHERE user_id = v_r3b_uid;
  SELECT status::text INTO v_r4_snap_status FROM public.profiles WHERE user_id = v_r4_uid;

  -- ============ PRECONDIÇÕES + FOR UPDATE ============
  -- R1
  PERFORM 1 FROM auth.users WHERE id = v_r1_uid AND email = 'assitido01@teste.com';
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R1: auth.users/email divergente'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = v_r1_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R1: profile ausente'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = v_r1_uid AND role = 'assistido' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R1: role assistido ausente'; END IF;
  PERFORM 1 FROM public.assistidos WHERE id = v_r1_aid AND user_id = v_r1_uid AND instituicao_id = v_fer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R1: assistido divergente'; END IF;
  SELECT count(*) INTO v_tmp FROM public.instituicao_usuarios WHERE user_id = v_r1_uid AND instituicao_id = v_fer;
  IF v_tmp <> 0 THEN RAISE EXCEPTION 'STAB10R R1: vinculo já existe'; END IF;

  -- R2
  PERFORM 1 FROM auth.users WHERE id = v_r2_uid AND email = 'assitido02@teste.com';
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R2: auth.users/email divergente'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = v_r2_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R2: profile ausente'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = v_r2_uid AND role = 'assistido' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R2: role assistido ausente'; END IF;
  PERFORM 1 FROM public.assistidos WHERE id = v_r2_aid AND user_id = v_r2_uid AND instituicao_id = v_fer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R2: assistido divergente'; END IF;
  SELECT count(*) INTO v_tmp FROM public.instituicao_usuarios WHERE user_id = v_r2_uid AND instituicao_id = v_fer;
  IF v_tmp <> 0 THEN RAISE EXCEPTION 'STAB10R R2: vinculo já existe'; END IF;

  -- R3-A
  PERFORM 1 FROM auth.users WHERE id = v_r3_uid AND email = 'assistido3@teste.com';
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R3A: auth.users/email divergente'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = v_r3_uid AND nome_completo = 'Assistido02' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R3A: profile.nome_completo divergente (esperado Assistido02)'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = v_r3_uid AND role = 'assistido' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R3A: role assistido ausente'; END IF;
  PERFORM 1 FROM public.assistidos WHERE id = v_r3_aid AND user_id = v_r3_uid AND instituicao_id = v_fer AND nome = 'Assistido 03' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R R3A: assistido divergente'; END IF;
  SELECT count(*) INTO v_tmp FROM public.instituicao_usuarios WHERE user_id = v_r3_uid AND instituicao_id = v_fer;
  IF v_tmp <> 0 THEN RAISE EXCEPTION 'STAB10R R3A: vinculo já existe'; END IF;

  -- ============ ESCRITAS ============
  INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
    VALUES (v_fer, v_r1_uid, 'assistido', 'ativo') RETURNING id INTO v_r1_iu;
  INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
    VALUES (v_fer, v_r2_uid, 'assistido', 'ativo') RETURNING id INTO v_r2_iu;

  UPDATE public.profiles SET nome_completo = 'Assistido 03', updated_at = now()
    WHERE user_id = v_r3_uid AND nome_completo = 'Assistido02';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  IF v_tmp <> 1 THEN RAISE EXCEPTION 'STAB10R R3A: update profile afetou % linhas', v_tmp; END IF;

  INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
    VALUES (v_fer, v_r3_uid, 'assistido', 'ativo') RETURNING id INTO v_r3_iu;

  -- ============ AUDITORIA ============
  INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_anteriores, dados_novos)
  VALUES
    (v_r1_uid, 'STAB10R_RECONCILIACAO_VINCULO_ASSISTIDO', 'instituicao_usuarios', v_r1_iu,
      jsonb_build_object('instituicao_usuario_existia', false, 'profile_nome_corrigido', false),
      jsonb_build_object('user_id', v_r1_uid, 'assistido_id', v_r1_aid, 'instituicao_id', v_fer, 'papel_local', 'assistido', 'status', 'ativo')),
    (v_r2_uid, 'STAB10R_RECONCILIACAO_VINCULO_ASSISTIDO', 'instituicao_usuarios', v_r2_iu,
      jsonb_build_object('instituicao_usuario_existia', false, 'profile_nome_corrigido', false),
      jsonb_build_object('user_id', v_r2_uid, 'assistido_id', v_r2_aid, 'instituicao_id', v_fer, 'papel_local', 'assistido', 'status', 'ativo')),
    (v_r3_uid, 'STAB10R_RECONCILIACAO_VINCULO_ASSISTIDO', 'instituicao_usuarios', v_r3_iu,
      jsonb_build_object('instituicao_usuario_existia', false, 'profile_nome_corrigido', true),
      jsonb_build_object('user_id', v_r3_uid, 'assistido_id', v_r3_aid, 'instituicao_id', v_fer, 'papel_local', 'assistido', 'status', 'ativo'));

  -- ============ VERIFICAÇÃO PÓS-EXECUÇÃO ============
  SELECT count(*) INTO v_tmp FROM public.instituicao_usuarios
    WHERE user_id = v_r1_uid AND instituicao_id = v_fer AND papel_local = 'assistido' AND status = 'ativo';
  IF v_tmp <> 1 THEN RAISE EXCEPTION 'STAB10R verify R1: vinculos = %', v_tmp; END IF;
  SELECT count(*) INTO v_tmp FROM public.instituicao_usuarios
    WHERE user_id = v_r2_uid AND instituicao_id = v_fer AND papel_local = 'assistido' AND status = 'ativo';
  IF v_tmp <> 1 THEN RAISE EXCEPTION 'STAB10R verify R2: vinculos = %', v_tmp; END IF;
  SELECT count(*) INTO v_tmp FROM public.instituicao_usuarios
    WHERE user_id = v_r3_uid AND instituicao_id = v_fer AND papel_local = 'assistido' AND status = 'ativo';
  IF v_tmp <> 1 THEN RAISE EXCEPTION 'STAB10R verify R3A: vinculos = %', v_tmp; END IF;

  PERFORM 1 FROM public.profiles WHERE user_id = v_r3_uid AND nome_completo = 'Assistido 03';
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R verify R3A: nome não aplicado'; END IF;

  PERFORM 1 FROM public.assistidos WHERE id = v_r1_aid AND user_id = v_r1_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R verify: R1 assistido.user_id alterado'; END IF;
  PERFORM 1 FROM public.assistidos WHERE id = v_r2_aid AND user_id = v_r2_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R verify: R2 assistido.user_id alterado'; END IF;
  PERFORM 1 FROM public.assistidos WHERE id = v_r3_aid AND user_id = v_r3_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R verify: R3A assistido.user_id alterado'; END IF;

  SELECT count(*) INTO v_tmp FROM public.instituicao_usuarios
    WHERE user_id IN (v_r1_uid, v_r2_uid, v_r3_uid) AND instituicao_id <> v_fer;
  IF v_tmp <> 0 THEN RAISE EXCEPTION 'STAB10R verify: vinculo fora da FER = %', v_tmp; END IF;

  SELECT count(*) INTO v_tmp FROM public.instituicao_usuarios WHERE user_id = v_r3b_uid;
  IF v_tmp <> 0 THEN RAISE EXCEPTION 'STAB10R verify: R3B recebeu vinculo'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = v_r3b_uid
    AND nome_completo IS NOT DISTINCT FROM v_r3b_snap_nome AND status::text = v_r3b_snap_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R verify: R3B profile alterado'; END IF;

  SELECT count(*) INTO v_tmp FROM public.instituicao_usuarios WHERE user_id = v_r4_uid;
  IF v_tmp <> 0 THEN RAISE EXCEPTION 'STAB10R verify: R4 recebeu vinculo'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = v_r4_uid AND status::text = v_r4_snap_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAB10R verify: R4 profile alterado'; END IF;

  RAISE NOTICE 'STAB10R OK — R1_iu=% R2_iu=% R3A_iu=%', v_r1_iu, v_r2_iu, v_r3_iu;
END $$;
