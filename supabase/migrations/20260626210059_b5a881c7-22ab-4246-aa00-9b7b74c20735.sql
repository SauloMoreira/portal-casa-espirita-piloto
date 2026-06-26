
-- ============================================================
-- 1. Novas colunas: completude + origem (rastreabilidade)
-- ============================================================
ALTER TABLE public.voluntarios
  ADD COLUMN IF NOT EXISTS cadastro_completo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origem_cadastro text,
  ADD COLUMN IF NOT EXISTS origem_assistido_id uuid REFERENCES public.assistidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- 2. Cadastro mínimo: relaxar NOT NULL dos campos complementares.
--    Mantidos obrigatórios: nome_completo, celular (e tipos via trigger).
-- ============================================================
ALTER TABLE public.voluntarios
  ALTER COLUMN cpf DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN data_nascimento DROP NOT NULL,
  ALTER COLUMN cep DROP NOT NULL,
  ALTER COLUMN logradouro DROP NOT NULL,
  ALTER COLUMN numero DROP NOT NULL,
  ALTER COLUMN bairro DROP NOT NULL,
  ALTER COLUMN cidade DROP NOT NULL,
  ALTER COLUMN estado DROP NOT NULL;

-- ============================================================
-- 3. Função de completude (espelha a UI). STABLE/sem efeitos.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_voluntario_cadastro_completo(
  p_nome text, p_celular text, p_cpf text, p_email text,
  p_data_nascimento date, p_cep text, p_logradouro text,
  p_numero text, p_bairro text, p_cidade text, p_estado text
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT
    coalesce(btrim(p_nome),'') <> ''
    AND public.fn_normalize_phone(p_celular) IS NOT NULL
    AND coalesce(regexp_replace(coalesce(p_cpf,''),'\D','','g'),'') <> ''
    AND coalesce(btrim(p_email),'') <> ''
    AND p_data_nascimento IS NOT NULL
    AND coalesce(regexp_replace(coalesce(p_cep,''),'\D','','g'),'') <> ''
    AND coalesce(btrim(p_logradouro),'') <> ''
    AND coalesce(btrim(p_numero),'') <> ''
    AND coalesce(btrim(p_bairro),'') <> ''
    AND coalesce(btrim(p_cidade),'') <> ''
    AND coalesce(btrim(p_estado),'') <> '';
$$;

-- Lista de campos pendentes para o gating do termo (mensagem explícita).
CREATE OR REPLACE FUNCTION public.fn_voluntario_pendencias_cadastro(p_voluntario_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v voluntarios%ROWTYPE; pend text[] := '{}';
BEGIN
  SELECT * INTO v FROM voluntarios WHERE id = p_voluntario_id;
  IF v.id IS NULL THEN RETURN ARRAY['Voluntário não encontrado']; END IF;
  IF coalesce(regexp_replace(coalesce(v.cpf,''),'\D','','g'),'') = '' THEN pend := pend || 'CPF'; END IF;
  IF coalesce(btrim(v.email),'') = '' THEN pend := pend || 'E-mail'; END IF;
  IF v.data_nascimento IS NULL THEN pend := pend || 'Data de nascimento'; END IF;
  IF coalesce(regexp_replace(coalesce(v.cep,''),'\D','','g'),'') = '' THEN pend := pend || 'CEP'; END IF;
  IF coalesce(btrim(v.logradouro),'') = '' THEN pend := pend || 'Logradouro'; END IF;
  IF coalesce(btrim(v.numero),'') = '' THEN pend := pend || 'Número'; END IF;
  IF coalesce(btrim(v.bairro),'') = '' THEN pend := pend || 'Bairro'; END IF;
  IF coalesce(btrim(v.cidade),'') = '' THEN pend := pend || 'Cidade'; END IF;
  IF coalesce(btrim(v.estado),'') = '' THEN pend := pend || 'Estado'; END IF;
  RETURN pend;
END;
$$;

-- ============================================================
-- 4. Trigger: regra mínima + recálculo de cadastro_completo + antiduplicidade
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_voluntario_cadastro()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
  v_cel text := public.fn_normalize_phone(NEW.celular);
  v_cpf text := NULLIF(regexp_replace(coalesce(NEW.cpf,''),'\D','','g'),'');
  v_dup uuid;
BEGIN
  -- Regra mínima (fonte de verdade no banco)
  IF coalesce(btrim(NEW.nome_completo),'') = '' THEN
    RAISE EXCEPTION 'Nome do voluntário é obrigatório';
  END IF;
  IF v_cel IS NULL THEN
    RAISE EXCEPTION 'Celular do voluntário é obrigatório e deve ser válido';
  END IF;
  IF coalesce(array_length(NEW.tipos_voluntario, 1), 0) < 1 THEN
    RAISE EXCEPTION 'Selecione pelo menos um tipo de voluntário';
  END IF;

  -- Antiduplicidade: só considera vínculos não desligados
  IF NEW.status IS DISTINCT FROM 'desligado' THEN
    SELECT id INTO v_dup FROM voluntarios v
    WHERE v.id <> NEW.id
      AND v.status <> 'desligado'
      AND (
        (NEW.origem_assistido_id IS NOT NULL AND v.origem_assistido_id = NEW.origem_assistido_id)
        OR (NEW.origem_user_id IS NOT NULL AND v.origem_user_id = NEW.origem_user_id)
        OR (v_cpf IS NOT NULL AND NULLIF(regexp_replace(coalesce(v.cpf,''),'\D','','g'),'') = v_cpf)
        OR (public.fn_normalize_phone(v.celular) = v_cel)
      )
    LIMIT 1;
    IF v_dup IS NOT NULL THEN
      RAISE EXCEPTION 'Já existe um voluntário ativo vinculado a esta pessoa (CPF, celular ou origem).';
    END IF;
  END IF;

  -- Recalcula completude
  NEW.cadastro_completo := public.fn_voluntario_cadastro_completo(
    NEW.nome_completo, NEW.celular, NEW.cpf, NEW.email, NEW.data_nascimento,
    NEW.cep, NEW.logradouro, NEW.numero, NEW.bairro, NEW.cidade, NEW.estado
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voluntario_cadastro ON public.voluntarios;
CREATE TRIGGER trg_voluntario_cadastro
  BEFORE INSERT OR UPDATE ON public.voluntarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_voluntario_cadastro();

-- Backfill da completude para registros existentes
UPDATE public.voluntarios SET updated_at = updated_at;

-- ============================================================
-- 5. Busca consolidada de pessoa para virar voluntário.
--    Precedência: assistido (1) > profile (2). Dedupe por CPF
--    normalizado e, na ausência, por celular normalizado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_buscar_pessoa_para_voluntario(p_termo text)
RETURNS TABLE (
  origem text,
  origem_id uuid,
  user_id uuid,
  nome text,
  cpf text,
  celular text,
  email text,
  data_nascimento date,
  cep text, logradouro text, numero text, complemento text,
  bairro text, cidade text, estado text, foto_url text,
  ja_voluntario boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_termo text := btrim(coalesce(p_termo,''));
  v_digits text := NULLIF(regexp_replace(coalesce(p_termo,''),'\D','','g'),'');
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'coordenador')) THEN
    RAISE EXCEPTION 'Sem permissão para buscar pessoas';
  END IF;
  IF length(v_termo) < 3 AND v_digits IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidatos AS (
    -- Assistidos (prioridade 1)
    SELECT 1 AS prio, 'assistido'::text AS origem, a.id AS origem_id, a.user_id,
           a.nome AS nome, a.cpf, coalesce(a.celular, a.telefone) AS celular, a.email,
           a.data_nascimento, a.cep, a.logradouro, a.numero, a.complemento,
           a.bairro, a.cidade, a.estado, a.foto_url
    FROM assistidos a
    WHERE a.deleted_at IS NULL
      AND (
        a.nome ILIKE '%'||v_termo||'%'
        OR (v_digits IS NOT NULL AND regexp_replace(coalesce(a.cpf,''),'\D','','g') ILIKE '%'||v_digits||'%')
        OR (v_digits IS NOT NULL AND public.fn_normalize_phone(coalesce(a.celular,a.telefone)) ILIKE '%'||v_digits||'%')
      )
    UNION ALL
    -- Perfis de usuário (prioridade 2)
    SELECT 2 AS prio, 'usuario'::text AS origem, p.id AS origem_id, p.user_id,
           p.nome_completo AS nome, p.cpf, p.celular, NULL::text AS email,
           NULL::date AS data_nascimento, p.cep, p.logradouro, p.numero, p.complemento,
           p.bairro, p.cidade, p.estado, p.foto_url
    FROM profiles p
    WHERE (
        p.nome_completo ILIKE '%'||v_termo||'%'
        OR (v_digits IS NOT NULL AND regexp_replace(coalesce(p.cpf,''),'\D','','g') ILIKE '%'||v_digits||'%')
        OR (v_digits IS NOT NULL AND public.fn_normalize_phone(p.celular) ILIKE '%'||v_digits||'%')
      )
  ),
  chaveado AS (
    SELECT c.*,
      coalesce(
        NULLIF(regexp_replace(coalesce(c.cpf,''),'\D','','g'),''),
        public.fn_normalize_phone(c.celular),
        c.origem||':'||c.origem_id::text
      ) AS dedupe_key
    FROM candidatos c
  ),
  unico AS (
    SELECT DISTINCT ON (dedupe_key) *
    FROM chaveado
    ORDER BY dedupe_key, prio
  )
  SELECT u.origem, u.origem_id, u.user_id, u.nome, u.cpf, u.celular, u.email,
         u.data_nascimento, u.cep, u.logradouro, u.numero, u.complemento,
         u.bairro, u.cidade, u.estado, u.foto_url,
         EXISTS (
           SELECT 1 FROM voluntarios v
           WHERE v.status <> 'desligado'
             AND (
               (u.origem = 'assistido' AND v.origem_assistido_id = u.origem_id)
               OR (u.user_id IS NOT NULL AND v.origem_user_id = u.user_id)
               OR (NULLIF(regexp_replace(coalesce(u.cpf,''),'\D','','g'),'') IS NOT NULL
                   AND NULLIF(regexp_replace(coalesce(v.cpf,''),'\D','','g'),'')
                       = NULLIF(regexp_replace(coalesce(u.cpf,''),'\D','','g'),''))
               OR (public.fn_normalize_phone(v.celular) IS NOT NULL
                   AND public.fn_normalize_phone(v.celular) = public.fn_normalize_phone(u.celular))
             )
         ) AS ja_voluntario
  FROM unico u
  ORDER BY u.nome
  LIMIT 25;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_buscar_pessoa_para_voluntario(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_voluntario_pendencias_cadastro(uuid) TO authenticated;

-- ============================================================
-- 6. Gating do termo: bloquear "gerar" quando cadastro incompleto.
-- ============================================================
CREATE OR REPLACE FUNCTION public.gerenciar_termo_voluntario(p_action text, p_voluntario_id uuid, p_path text DEFAULT NULL::text, p_nome text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := has_role(auth.uid(), 'admin');
  v_nome text;
  v_old_path text;
  v_completo boolean;
  v_pend text[];
BEGIN
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Apenas administradores podem gerenciar o termo');
  END IF;

  IF p_action NOT IN ('gerar','assinar','validar','rejeitar') THEN
    RETURN jsonb_build_object('error', 'Ação inválida');
  END IF;

  SELECT nome_completo, termo_assinado_path, cadastro_completo
    INTO v_nome, v_old_path, v_completo
  FROM voluntarios WHERE id = p_voluntario_id;
  IF v_nome IS NULL THEN
    RETURN jsonb_build_object('error', 'Voluntário não encontrado');
  END IF;

  -- Termo exige cadastro completo (gerar/assinar)
  IF p_action IN ('gerar','assinar') AND NOT coalesce(v_completo, false) THEN
    v_pend := public.fn_voluntario_pendencias_cadastro(p_voluntario_id);
    RETURN jsonb_build_object(
      'error', 'Complete o cadastro para gerar o termo',
      'pendencias', to_jsonb(v_pend)
    );
  END IF;

  IF p_action = 'gerar' THEN
    UPDATE voluntarios SET
      termo_status = CASE WHEN termo_status IN ('assinado_enviado','validado') THEN termo_status ELSE 'gerado' END,
      termo_gerado_em = now(),
      termo_gerado_por = auth.uid()
    WHERE id = p_voluntario_id;
    INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
    VALUES (auth.uid(), 'voluntarios', 'TERMO_GERADO', p_voluntario_id,
      jsonb_build_object('executed_by', auth.uid(), 'nome', v_nome));
    RETURN jsonb_build_object('success', true, 'message', 'Termo gerado.');
  END IF;

  IF p_action = 'assinar' THEN
    IF p_path IS NULL OR length(trim(p_path)) = 0 THEN
      RETURN jsonb_build_object('error', 'Caminho do arquivo é obrigatório');
    END IF;
    UPDATE voluntarios SET
      termo_status = 'assinado_enviado',
      termo_assinado_path = p_path,
      termo_assinado_nome = p_nome,
      termo_assinado_em = now(),
      termo_validado_por = NULL,
      termo_validado_em = NULL,
      termo_rejeitado_motivo = NULL
    WHERE id = p_voluntario_id;
    INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
    VALUES (auth.uid(), 'voluntarios',
      CASE WHEN v_old_path IS NOT NULL THEN 'TERMO_REENVIADO' ELSE 'TERMO_ASSINADO_ENVIADO' END,
      p_voluntario_id,
      jsonb_build_object('executed_by', auth.uid(), 'nome', v_nome, 'arquivo', p_nome, 'path', p_path, 'path_anterior', v_old_path));
    RETURN jsonb_build_object('success', true, 'message', 'Termo assinado enviado.');
  END IF;

  IF p_action = 'validar' THEN
    UPDATE voluntarios SET
      termo_status = 'validado',
      termo_validado_por = auth.uid(),
      termo_validado_em = now(),
      termo_rejeitado_motivo = NULL
    WHERE id = p_voluntario_id;
    INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
    VALUES (auth.uid(), 'voluntarios', 'TERMO_VALIDADO', p_voluntario_id,
      jsonb_build_object('executed_by', auth.uid(), 'nome', v_nome));
    RETURN jsonb_build_object('success', true, 'message', 'Termo validado.');
  END IF;

  -- rejeitar
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RETURN jsonb_build_object('error', 'Informe o motivo da rejeição');
  END IF;
  UPDATE voluntarios SET
    termo_status = 'rejeitado',
    termo_validado_por = auth.uid(),
    termo_validado_em = now(),
    termo_rejeitado_motivo = p_motivo
  WHERE id = p_voluntario_id;
  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (auth.uid(), 'voluntarios', 'TERMO_REJEITADO', p_voluntario_id,
    jsonb_build_object('executed_by', auth.uid(), 'nome', v_nome, 'motivo', p_motivo));
  RETURN jsonb_build_object('success', true, 'message', 'Termo rejeitado.');
END;
$function$;
