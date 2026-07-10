
CREATE OR REPLACE FUNCTION public.fn_voluntarios_orfaos_do_tenant(
  p_instituicao_id uuid
)
RETURNS TABLE(
  voluntario_id uuid,
  nome_completo text,
  email text,
  celular text,
  cpf text,
  tipos_voluntario text[],
  status text,
  possui_email boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id,
    v.nome_completo,
    v.email,
    v.celular,
    v.cpf,
    v.tipos_voluntario,
    v.status,
    (v.email IS NOT NULL AND length(trim(v.email)) > 0) AS possui_email,
    v.created_at
  FROM public.voluntarios v
  WHERE v.instituicao_id = p_instituicao_id
    AND v.status <> 'desligado'
    AND v.origem_user_id IS NULL
    AND (
      public.user_is_admin_instituicao(auth.uid(), p_instituicao_id)
      OR public.has_role(auth.uid(), 'administrador_master'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  ORDER BY v.nome_completo;
$$;

REVOKE ALL ON FUNCTION public.fn_voluntarios_orfaos_do_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_voluntarios_orfaos_do_tenant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_backfill_fix16_vinculos_voluntarios()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_inseridos int := 0;
  v_ja_existentes int := 0;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'administrador_master'::app_role)
    OR EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para executar backfill';
  END IF;

  FOR v_rec IN
    SELECT v.id AS voluntario_id, v.origem_user_id, v.instituicao_id, v.nome_completo
    FROM public.voluntarios v
    WHERE v.status <> 'desligado'
      AND v.origem_user_id IS NOT NULL
      AND v.instituicao_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.instituicao_usuarios
      WHERE instituicao_id = v_rec.instituicao_id
        AND user_id = v_rec.origem_user_id
        AND status = 'ativo'
    ) THEN
      v_ja_existentes := v_ja_existentes + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
    VALUES (v_rec.instituicao_id, v_rec.origem_user_id, 'voluntario', 'ativo')
    ON CONFLICT (instituicao_id, user_id, papel_local) DO UPDATE
      SET status = 'ativo';

    v_inseridos := v_inseridos + 1;

    INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
    VALUES (
      auth.uid(),
      'saas06_c1_fix16_voluntario_usuario:voluntario_orfao_vinculado',
      'voluntarios',
      v_rec.voluntario_id,
      jsonb_build_object(
        'instituicao_id', v_rec.instituicao_id,
        'user_id', v_rec.origem_user_id,
        'nome', v_rec.nome_completo
      )
    );
  END LOOP;

  INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
  VALUES (
    auth.uid(),
    'saas06_c1_fix16_voluntario_usuario:backfill_fix16_executado',
    'sistema',
    NULL,
    jsonb_build_object(
      'vinculos_inseridos', v_inseridos,
      'ja_existentes', v_ja_existentes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'vinculos_inseridos', v_inseridos,
    'ja_existentes', v_ja_existentes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_backfill_fix16_vinculos_voluntarios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_backfill_fix16_vinculos_voluntarios() TO authenticated;

-- Execução imediata idempotente do backfill (sem exigir auth.uid()).
DO $$
DECLARE
  v_rec record;
  v_inseridos int := 0;
  v_ja_existentes int := 0;
BEGIN
  FOR v_rec IN
    SELECT v.id AS voluntario_id, v.origem_user_id, v.instituicao_id, v.nome_completo, v.email
    FROM public.voluntarios v
    WHERE v.status <> 'desligado'
      AND v.instituicao_id IS NOT NULL
  LOOP
    IF v_rec.origem_user_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.instituicao_usuarios
        WHERE instituicao_id = v_rec.instituicao_id
          AND user_id = v_rec.origem_user_id
          AND status = 'ativo'
      ) THEN
        v_ja_existentes := v_ja_existentes + 1;
      ELSE
        INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
        VALUES (v_rec.instituicao_id, v_rec.origem_user_id, 'voluntario', 'ativo')
        ON CONFLICT (instituicao_id, user_id, papel_local) DO UPDATE
          SET status = 'ativo';
        v_inseridos := v_inseridos + 1;

        INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
        VALUES (
          NULL,
          'saas06_c1_fix16_voluntario_usuario:voluntario_orfao_vinculado',
          'voluntarios',
          v_rec.voluntario_id,
          jsonb_build_object(
            'instituicao_id', v_rec.instituicao_id,
            'user_id', v_rec.origem_user_id,
            'nome', v_rec.nome_completo,
            'origem', 'backfill_migracao'
          )
        );
      END IF;
    ELSE
      INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
      VALUES (
        NULL,
        'saas06_c1_fix16_voluntario_usuario:usuario_institucional_preparado_por_backfill',
        'voluntarios',
        v_rec.voluntario_id,
        jsonb_build_object(
          'instituicao_id', v_rec.instituicao_id,
          'nome', v_rec.nome_completo,
          'possui_email', (v_rec.email IS NOT NULL AND length(trim(v_rec.email)) > 0),
          'origem', 'backfill_migracao',
          'status_operacional', 'nao_concedido_por_padrao'
        )
      );
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (user_id, acao, tabela, registro_id, dados_novos)
  VALUES (
    NULL,
    'saas06_c1_fix16_voluntario_usuario:backfill_fix16_executado',
    'sistema',
    NULL,
    jsonb_build_object(
      'vinculos_inseridos', v_inseridos,
      'ja_existentes', v_ja_existentes,
      'origem', 'migracao_inicial'
    )
  );
END;
$$;
