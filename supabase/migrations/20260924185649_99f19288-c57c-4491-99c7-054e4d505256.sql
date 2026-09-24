CREATE TYPE public.elev_status AS ENUM ('PENDENTE','EM_ANDAMENTO','INSTALADO');

CREATE TABLE public.elev_lojas (
  unidade_id integer PRIMARY KEY REFERENCES public.unidades(id) ON DELETE CASCADE,
  ano_migracao text,
  lote text,
  data_prevista date,
  estoque_leitoras integer NOT NULL DEFAULT 0,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.elev_elevadores (
  id serial PRIMARY KEY,
  unidade_id integer NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  marca text,
  numero_serie text,
  status public.elev_status NOT NULL DEFAULT 'PENDENTE',
  instalado_em timestamptz,
  instalado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.elev_elevadores(unidade_id);
CREATE TABLE public.elev_historico (
  id bigserial PRIMARY KEY,
  elevador_id integer NOT NULL REFERENCES public.elev_elevadores(id) ON DELETE CASCADE,
  usuario_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  status_anterior public.elev_status,
  status_novo public.elev_status,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.elev_lojas, public.elev_elevadores TO authenticated;
GRANT SELECT, INSERT ON public.elev_historico TO authenticated;
GRANT USAGE ON SEQUENCE public.elev_elevadores_id_seq, public.elev_historico_id_seq TO authenticated;
GRANT ALL ON public.elev_lojas, public.elev_elevadores, public.elev_historico TO service_role;

ALTER TABLE public.elev_lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elev_elevadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elev_historico ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_elev_is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id=auth.uid() AND u.ativo=true
    AND u.permissao <> 'CLIENTE' AND u.access_scope NOT IN ('BLOCKED','GRAFANA_ONLY'));
$$;
CREATE OR REPLACE FUNCTION public.fn_elev_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id=auth.uid() AND u.ativo=true
    AND u.permissao IN ('SUPERADMIN','ADMIN'));
$$;

CREATE POLICY "elev_lojas staff read" ON public.elev_lojas FOR SELECT TO authenticated USING (public.fn_elev_is_staff());
CREATE POLICY "elev_lojas admin write" ON public.elev_lojas FOR ALL TO authenticated USING (public.fn_elev_is_admin()) WITH CHECK (public.fn_elev_is_admin());
CREATE POLICY "elev staff read" ON public.elev_elevadores FOR SELECT TO authenticated USING (public.fn_elev_is_staff());
CREATE POLICY "elev staff update" ON public.elev_elevadores FOR UPDATE TO authenticated USING (public.fn_elev_is_staff()) WITH CHECK (public.fn_elev_is_staff());
CREATE POLICY "elev admin insert" ON public.elev_elevadores FOR INSERT TO authenticated WITH CHECK (public.fn_elev_is_admin());
CREATE POLICY "elev admin delete" ON public.elev_elevadores FOR DELETE TO authenticated USING (public.fn_elev_is_admin());
CREATE POLICY "elev hist read" ON public.elev_historico FOR SELECT TO authenticated USING (public.fn_elev_is_staff());

-- Técnicos só podem mudar status/observação/instalação; demais campos só admin
CREATE OR REPLACE FUNCTION public.fn_elev_before_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid int;
BEGIN
  SELECT id INTO v_uid FROM public.usuarios WHERE auth_user_id=auth.uid() LIMIT 1;
  IF auth.uid() IS NOT NULL AND NOT public.fn_elev_is_admin() THEN
    IF NEW.unidade_id IS DISTINCT FROM OLD.unidade_id OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.marca IS DISTINCT FROM OLD.marca OR NEW.numero_serie IS DISTINCT FROM OLD.numero_serie THEN
      RAISE EXCEPTION 'somente_admin_edita_cadastro';
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='INSTALADO' THEN
      NEW.instalado_em := COALESCE(NEW.instalado_em, now());
      NEW.instalado_por := COALESCE(NEW.instalado_por, v_uid);
    ELSE
      NEW.instalado_em := NULL; NEW.instalado_por := NULL;
    END IF;
    INSERT INTO public.elev_historico(elevador_id, usuario_id, status_anterior, status_novo, observacao)
    VALUES (NEW.id, v_uid, OLD.status, NEW.status, NEW.observacao);
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_elev_before_update BEFORE UPDATE ON public.elev_elevadores FOR EACH ROW EXECUTE FUNCTION public.fn_elev_before_update();
CREATE TRIGGER trg_elev_lojas_ts BEFORE UPDATE ON public.elev_lojas FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();

CREATE OR REPLACE FUNCTION public.fn_user_allowed_tabs(_usuario_id integer DEFAULT NULL::integer)
 RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid int; v_perm text;
  v_all CONSTANT text[] := ARRAY['dashboard','chamados','atendimento','usuarios','empresas','unidades',
    'operadoras','grafana','permissoes','base_conhecimento','relatorios','equipes','zabbix','pessoas','responsaveis','linkai','elevadores'];
  v_result text[];
BEGIN
  IF _usuario_id IS NULL THEN
    SELECT id, permissao INTO v_uid, v_perm FROM public.fn_current_usuario();
  ELSE
    SELECT id, permissao INTO v_uid, v_perm FROM public.usuarios WHERE id = _usuario_id;
  END IF;
  IF v_uid IS NULL THEN RETURN ARRAY[]::text[]; END IF;
  IF v_perm IN ('SUPERADMIN','ADMIN') THEN RETURN v_all; END IF;
  SELECT COALESCE(array_agg(tab_key ORDER BY tab_key), ARRAY[]::text[]) INTO v_result
  FROM public.user_tab_permissions WHERE usuario_id = v_uid AND allowed = true;
  IF array_length(v_result, 1) IS NULL THEN
    IF v_perm = 'CLIENTE' THEN v_result := ARRAY['chamados']; ELSE v_result := v_all; END IF;
  END IF;
  RETURN v_result;
END $function$;