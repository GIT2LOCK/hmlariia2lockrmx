ALTER TYPE public.elev_status ADD VALUE IF NOT EXISTS 'PAUSADO';
ALTER TABLE public.elev_elevadores ADD COLUMN IF NOT EXISTS iniciado_em timestamptz, ADD COLUMN IF NOT EXISTS iniciado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.fn_elev_before_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid int; v_admin boolean; o text; n text;
BEGIN
  SELECT id INTO v_uid FROM public.usuarios WHERE auth_user_id=auth.uid() LIMIT 1;
  v_admin := auth.uid() IS NULL OR public.fn_elev_is_admin();
  o := OLD.status::text; n := NEW.status::text;
  IF NOT v_admin THEN
    IF NEW.unidade_id IS DISTINCT FROM OLD.unidade_id OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.marca IS DISTINCT FROM OLD.marca OR NEW.numero_serie IS DISTINCT FROM OLD.numero_serie THEN
      RAISE EXCEPTION 'somente_admin_edita_cadastro';
    END IF;
    IF o <> n AND NOT (
         (o='PENDENTE' AND n='EM_ANDAMENTO') OR
         (o='EM_ANDAMENTO' AND n IN ('PAUSADO','INSTALADO')) OR
         (o='PAUSADO' AND n IN ('EM_ANDAMENTO','INSTALADO'))) THEN
      RAISE EXCEPTION 'transicao_nao_permitida: % -> %', o, n;
    END IF;
  END IF;
  IF o <> n THEN
    IF n='EM_ANDAMENTO' AND o='PENDENTE' THEN
      NEW.iniciado_em := now(); NEW.iniciado_por := v_uid;
    END IF;
    IF n='INSTALADO' THEN
      NEW.instalado_em := COALESCE(NEW.instalado_em, now()); NEW.instalado_por := COALESCE(NEW.instalado_por, v_uid);
    ELSE
      NEW.instalado_em := NULL; NEW.instalado_por := NULL;
    END IF;
    IF n='PENDENTE' THEN NEW.iniciado_em := NULL; NEW.iniciado_por := NULL; END IF;
    INSERT INTO public.elev_historico(elevador_id, usuario_id, status_anterior, status_novo, observacao)
    VALUES (NEW.id, v_uid, OLD.status, NEW.status, NEW.observacao);
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_elev_before_update() FROM PUBLIC, anon, authenticated;