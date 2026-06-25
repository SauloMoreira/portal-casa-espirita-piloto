-- ============================================================================
-- Cadastro mínimo operacional do assistido
-- ============================================================================

-- 1) Coluna de status de completude do cadastro
ALTER TABLE public.assistidos
  ADD COLUMN IF NOT EXISTS cadastro_completo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assistidos.cadastro_completo IS
  'true quando todos os dados complementares estão preenchidos; false = cadastro mínimo/incompleto (apenas nome + celular).';

-- 2) Função pura: decide se o cadastro está completo
CREATE OR REPLACE FUNCTION public.fn_assistido_cadastro_esta_completo(a public.assistidos)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    coalesce(btrim(a.nome), '')                          <> '' AND
    coalesce(regexp_replace(a.celular,'\D','','g'),'')   <> '' AND
    coalesce(regexp_replace(a.cpf,'\D','','g'),'')       <> '' AND
    coalesce(btrim(a.email), '')                         <> '' AND
    a.data_nascimento IS NOT NULL AND
    coalesce(regexp_replace(a.cep,'\D','','g'),'')       <> '' AND
    coalesce(btrim(a.logradouro), '')                    <> '' AND
    coalesce(btrim(a.numero), '')                        <> '' AND
    coalesce(btrim(a.bairro), '')                        <> '' AND
    coalesce(btrim(a.cidade), '')                        <> '' AND
    coalesce(btrim(a.estado), '')                        <> '';
$$;

-- 3) Backfill ANTES da trigger (evita disparo da validação nos legados)
UPDATE public.assistidos a
  SET cadastro_completo = public.fn_assistido_cadastro_esta_completo(a);

-- 4) Trigger: valida mínimo, normaliza celular, deduplica e marca completude
CREATE OR REPLACE FUNCTION public.fn_assistido_cadastro_minimo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cel text;
  v_cel_antigo text;
  v_dup_count int;
BEGIN
  -- Nome sempre obrigatório
  NEW.nome := btrim(coalesce(NEW.nome, ''));
  IF NEW.nome = '' THEN
    RAISE EXCEPTION 'Nome é obrigatório para o cadastro do assistido.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Normaliza celular (apenas dígitos) quando presente
  v_cel := regexp_replace(coalesce(NEW.celular, ''), '\D', '', 'g');

  -- Celular obrigatório no cadastro mínimo inicial (INSERT)
  IF TG_OP = 'INSERT' THEN
    IF v_cel = '' THEN
      RAISE EXCEPTION 'Celular é obrigatório para o cadastro do assistido.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Quando informado, valida formato (DDD + número)
  IF v_cel <> '' AND length(v_cel) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Celular inválido: informe DDD + número (10 ou 11 dígitos).'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.celular := NULLIF(v_cel, '');
  IF coalesce(regexp_replace(coalesce(NEW.telefone,''),'\D','','g'),'') = '' AND v_cel <> '' THEN
    NEW.telefone := v_cel;
  END IF;

  -- Normaliza CPF/CEP quando presentes (não obrigatórios)
  IF coalesce(NEW.cpf,'') <> '' THEN
    NEW.cpf := NULLIF(regexp_replace(NEW.cpf, '\D', '', 'g'), '');
  END IF;
  IF coalesce(NEW.cep,'') <> '' THEN
    NEW.cep := NULLIF(regexp_replace(NEW.cep, '\D', '', 'g'), '');
  END IF;

  -- Deduplicação por celular entre cadastros ativos (não excluídos)
  v_cel_antigo := CASE WHEN TG_OP = 'UPDATE'
    THEN regexp_replace(coalesce(OLD.celular,''),'\D','','g') ELSE '' END;
  IF v_cel <> '' AND v_cel IS DISTINCT FROM NULLIF(v_cel_antigo,'') THEN
    SELECT count(*) INTO v_dup_count
    FROM public.assistidos x
    WHERE x.deleted_at IS NULL
      AND x.id <> NEW.id
      AND regexp_replace(coalesce(x.celular,''),'\D','','g') = v_cel;
    IF v_dup_count > 0 THEN
      RAISE EXCEPTION 'Já existe um assistido cadastrado com este celular.'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  -- Recalcula completude do cadastro
  NEW.cadastro_completo := public.fn_assistido_cadastro_esta_completo(NEW);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assistido_cadastro_minimo ON public.assistidos;
CREATE TRIGGER trg_assistido_cadastro_minimo
  BEFORE INSERT OR UPDATE ON public.assistidos
  FOR EACH ROW EXECUTE FUNCTION public.fn_assistido_cadastro_minimo();

-- 5) Índice único parcial: deduplicação por celular entre ativos
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistidos_celular_ativo
  ON public.assistidos (celular)
  WHERE deleted_at IS NULL AND celular IS NOT NULL;