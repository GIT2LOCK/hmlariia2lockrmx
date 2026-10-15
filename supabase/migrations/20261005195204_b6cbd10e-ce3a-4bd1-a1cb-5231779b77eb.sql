DROP INDEX IF EXISTS public.elev_faciais_elevador_uniq;
CREATE INDEX IF NOT EXISTS elev_faciais_elevador_idx ON public.elev_faciais (elevador_id);
CREATE OR REPLACE FUNCTION public.fn_elev_facial_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid int := public.fn_elev_uid(); v_un int;
BEGIN
  IF NEW.elevador_id IS NOT NULL THEN
    SELECT unidade_id INTO v_un FROM public.elev_elevadores WHERE id=NEW.elevador_id;
    IF v_un IS DISTINCT FROM NEW.unidade_id THEN RAISE EXCEPTION 'facial_unidade_diferente_do_elevador'; END IF;
    IF NEW.instalacao='NAO_INICIADA' THEN NEW.instalacao := 'AGUARDANDO'; END IF;
    NEW.presenca := 'PRESENTE';
  END IF;
  IF NEW.instalacao='INSTALADA' AND NEW.elevador_id IS NULL THEN RAISE EXCEPTION 'facial_instalado_exige_elevador'; END IF;
  IF NEW.elevador_id IS NULL AND NEW.instalacao='AGUARDANDO' THEN NEW.instalacao := 'NAO_INICIADA'; END IF;
  IF NEW.instalacao='INSTALADA' THEN
    NEW.instalado_em := COALESCE(NEW.instalado_em, now()); NEW.instalado_por := COALESCE(NEW.instalado_por, v_uid);
  ELSE NEW.instalado_em := NULL; NEW.instalado_por := NULL; END IF;
  IF TG_OP='INSERT' THEN NEW.criado_por := COALESCE(NEW.criado_por, v_uid); END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;