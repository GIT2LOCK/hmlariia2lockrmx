CREATE TYPE public.elev_validacao_status AS ENUM ('NAO_VALIDADO','VALIDADO');
CREATE TYPE public.elev_facial_situacao AS ENUM ('NAO_IDENTIFICADO','ENCONTRADO','NAO_ENCONTRADO','NECESSITA_COMPRA');
CREATE TYPE public.elev_facial_presenca AS ENUM ('NAO_IDENTIFICADO','PRESENTE','NAO_ENCONTRADO');
CREATE TYPE public.elev_facial_instalacao AS ENUM ('NAO_INICIADA','AGUARDANDO','INSTALADA');

ALTER TABLE public.elev_elevadores
  ADD COLUMN validacao_status public.elev_validacao_status NOT NULL DEFAULT 'NAO_VALIDADO',
  ADD COLUMN validado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN validado_em timestamptz,
  ADD COLUMN validacao_obs text,
  ADD COLUMN facial_situacao public.elev_facial_situacao NOT NULL DEFAULT 'NAO_IDENTIFICADO';

CREATE TABLE public.elev_faciais (
  id bigserial PRIMARY KEY,
  unidade_id integer NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  elevador_id integer REFERENCES public.elev_elevadores(id) ON DELETE SET NULL,
  codigo text NOT NULL,
  marca text, modelo text, numero_serie text,
  presenca public.elev_facial_presenca NOT NULL DEFAULT 'PRESENTE',
  instalacao public.elev_facial_instalacao NOT NULL DEFAULT 'NAO_INICIADA',
  instalado_em timestamptz,
  instalado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  observacao text,
  criado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elev_faciais TO authenticated;
GRANT ALL ON public.elev_faciais TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.elev_faciais_id_seq TO authenticated, service_role;
ALTER TABLE public.elev_faciais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "elev faciais read" ON public.elev_faciais FOR SELECT TO authenticated USING (public.fn_elev_is_staff());
CREATE POLICY "elev faciais insert" ON public.elev_faciais FOR INSERT TO authenticated WITH CHECK (public.fn_elev_is_admin());
CREATE POLICY "elev faciais update" ON public.elev_faciais FOR UPDATE TO authenticated USING (public.fn_elev_is_admin()) WITH CHECK (public.fn_elev_is_admin());
CREATE POLICY "elev faciais delete" ON public.elev_faciais FOR DELETE TO authenticated USING (public.fn_elev_is_admin());
CREATE UNIQUE INDEX elev_faciais_elevador_uniq ON public.elev_faciais(elevador_id) WHERE elevador_id IS NOT NULL;
CREATE INDEX elev_faciais_unidade_idx ON public.elev_faciais(unidade_id);

ALTER TABLE public.elev_cronograma_faciais ADD COLUMN facial_id bigint REFERENCES public.elev_faciais(id) ON DELETE SET NULL;

ALTER TABLE public.elev_historico
  ALTER COLUMN elevador_id DROP NOT NULL,
  ADD COLUMN facial_id bigint REFERENCES public.elev_faciais(id) ON DELETE SET NULL,
  ADD COLUMN acao text,
  ADD COLUMN valor_anterior text,
  ADD COLUMN valor_novo text;

CREATE OR REPLACE FUNCTION public.fn_elev_uid() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM public.usuarios WHERE auth_user_id=auth.uid() LIMIT 1 $$;

-- Facial: validações e histórico
CREATE OR REPLACE FUNCTION public.fn_elev_facial_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid int := public.fn_elev_uid(); v_un int; v_outro text;
BEGIN
  IF NEW.elevador_id IS NOT NULL THEN
    SELECT unidade_id INTO v_un FROM public.elev_elevadores WHERE id=NEW.elevador_id;
    IF v_un IS DISTINCT FROM NEW.unidade_id THEN RAISE EXCEPTION 'facial_unidade_diferente_do_elevador'; END IF;
    SELECT COALESCE(e.numero_serie, e.tipo || ' #' || e.id) INTO v_outro FROM public.elev_faciais f JOIN public.elev_elevadores e ON e.id=f.elevador_id
      WHERE f.elevador_id=NEW.elevador_id AND f.id IS DISTINCT FROM NEW.id LIMIT 1;
    IF v_outro IS NOT NULL THEN RAISE EXCEPTION 'Este elevador já possui outro facial associado (%)', v_outro; END IF;
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
CREATE TRIGGER trg_elev_facial_guard BEFORE INSERT OR UPDATE ON public.elev_faciais FOR EACH ROW EXECUTE FUNCTION public.fn_elev_facial_guard();

CREATE OR REPLACE FUNCTION public.fn_elev_facial_hist() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid int := public.fn_elev_uid();
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.elev_historico(elevador_id, facial_id, usuario_id, acao, valor_novo) VALUES (NEW.elevador_id, NEW.id, v_uid, 'FACIAL_CADASTRADO', NEW.codigo);
    IF NEW.elevador_id IS NOT NULL THEN
      INSERT INTO public.elev_historico(elevador_id, facial_id, usuario_id, acao, valor_novo) VALUES (NEW.elevador_id, NEW.id, v_uid, 'FACIAL_ASSOCIADO', NEW.codigo);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.elevador_id IS DISTINCT FROM OLD.elevador_id THEN
    INSERT INTO public.elev_historico(elevador_id, facial_id, usuario_id, acao, valor_anterior, valor_novo)
    VALUES (COALESCE(NEW.elevador_id, OLD.elevador_id), NEW.id, v_uid, CASE WHEN NEW.elevador_id IS NULL THEN 'FACIAL_DESASSOCIADO' ELSE 'FACIAL_ASSOCIADO' END, OLD.elevador_id::text, NEW.elevador_id::text);
  END IF;
  IF NEW.presenca IS DISTINCT FROM OLD.presenca THEN
    INSERT INTO public.elev_historico(elevador_id, facial_id, usuario_id, acao, valor_anterior, valor_novo)
    VALUES (NEW.elevador_id, NEW.id, v_uid, CASE WHEN NEW.presenca='PRESENTE' THEN 'FACIAL_ENCONTRADO' ELSE 'FACIAL_PRESENCA' END, OLD.presenca::text, NEW.presenca::text);
  END IF;
  IF NEW.instalacao IS DISTINCT FROM OLD.instalacao THEN
    INSERT INTO public.elev_historico(elevador_id, facial_id, usuario_id, acao, valor_anterior, valor_novo)
    VALUES (NEW.elevador_id, NEW.id, v_uid, CASE NEW.instalacao WHEN 'INSTALADA' THEN 'FACIAL_INSTALADO' WHEN 'AGUARDANDO' THEN 'FACIAL_AGUARDANDO_INSTALACAO' ELSE 'FACIAL_INSTALACAO' END, OLD.instalacao::text, NEW.instalacao::text);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_elev_facial_hist AFTER INSERT OR UPDATE ON public.elev_faciais FOR EACH ROW EXECUTE FUNCTION public.fn_elev_facial_hist();

-- Elevador: preserva regras e adiciona validação
CREATE OR REPLACE FUNCTION public.fn_elev_before_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid int; v_admin boolean; o text; n text;
BEGIN
  v_uid := public.fn_elev_uid();
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
  IF NEW.unidade_id IS DISTINCT FROM OLD.unidade_id AND EXISTS (SELECT 1 FROM public.elev_faciais WHERE elevador_id=NEW.id) THEN
    RAISE EXCEPTION 'desassocie_o_facial_antes_de_trocar_unidade';
  END IF;
  IF o <> n THEN
    IF n='INSTALADO' AND NOT EXISTS (SELECT 1 FROM public.elev_faciais WHERE elevador_id=NEW.id) THEN
      RAISE EXCEPTION 'elevador_sem_facial: associe um facial antes de encerrar';
    END IF;
    IF n='EM_ANDAMENTO' AND o='PENDENTE' THEN NEW.iniciado_em := now(); NEW.iniciado_por := v_uid; END IF;
    IF n='INSTALADO' THEN
      NEW.instalado_em := COALESCE(NEW.instalado_em, now()); NEW.instalado_por := COALESCE(NEW.instalado_por, v_uid);
    ELSE NEW.instalado_em := NULL; NEW.instalado_por := NULL; END IF;
    IF n='PENDENTE' THEN NEW.iniciado_em := NULL; NEW.iniciado_por := NULL; END IF;
    INSERT INTO public.elev_historico(elevador_id, usuario_id, status_anterior, status_novo, observacao, acao, valor_anterior, valor_novo)
    VALUES (NEW.id, v_uid, OLD.status, NEW.status, NEW.observacao,
      CASE WHEN n='PAUSADO' THEN 'ELEVADOR_PAUSADO' WHEN o='PAUSADO' AND n='EM_ANDAMENTO' THEN 'ELEVADOR_RETOMADO' WHEN n='PENDENTE' THEN 'ELEVADOR_REINICIADO'
           WHEN n='EM_ANDAMENTO' THEN 'ELEVADOR_INICIADO' WHEN n='INSTALADO' THEN 'ELEVADOR_INSTALADO' ELSE 'STATUS' END, o, n);
  END IF;
  IF NEW.validacao_status IS DISTINCT FROM OLD.validacao_status OR NEW.facial_situacao IS DISTINCT FROM OLD.facial_situacao THEN
    IF NEW.validacao_status='VALIDADO' THEN NEW.validado_em := now(); NEW.validado_por := v_uid;
    ELSE NEW.validado_em := NULL; NEW.validado_por := NULL; END IF;
    INSERT INTO public.elev_historico(elevador_id, usuario_id, acao, valor_anterior, valor_novo, observacao)
    VALUES (NEW.id, v_uid, CASE WHEN NEW.validacao_status='VALIDADO' THEN 'ELEVADOR_VALIDADO' ELSE 'VALIDACAO_REMOVIDA' END,
      OLD.validacao_status::text || ' / ' || OLD.facial_situacao::text, NEW.validacao_status::text || ' / ' || NEW.facial_situacao::text, NEW.validacao_obs);
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_elev_before_update() FROM PUBLIC, anon, authenticated;

-- Elevador instalado → facial instalado
CREATE OR REPLACE FUNCTION public.fn_elev_after_update_facial() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status::text='INSTALADO' AND OLD.status::text<>'INSTALADO' THEN
    UPDATE public.elev_faciais SET instalacao='INSTALADA' WHERE elevador_id=NEW.id AND instalacao<>'INSTALADA';
  ELSIF NEW.status::text='PENDENTE' AND OLD.status::text='INSTALADO' THEN
    UPDATE public.elev_faciais SET instalacao='AGUARDANDO' WHERE elevador_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_elev_after_update_facial AFTER UPDATE OF status ON public.elev_elevadores FOR EACH ROW EXECUTE FUNCTION public.fn_elev_after_update_facial();

CREATE OR REPLACE FUNCTION public.fn_elev_after_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.elev_historico(elevador_id, usuario_id, acao, valor_novo) VALUES (NEW.id, public.fn_elev_uid(), 'ELEVADOR_CRIADO', NEW.tipo);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_elev_after_insert AFTER INSERT ON public.elev_elevadores FOR EACH ROW EXECUTE FUNCTION public.fn_elev_after_insert();
REVOKE EXECUTE ON FUNCTION public.fn_elev_facial_guard(), public.fn_elev_facial_hist(), public.fn_elev_after_update_facial(), public.fn_elev_after_insert() FROM PUBLIC, anon, authenticated;

-- Views
CREATE VIEW public.elev_v_elevador_situacao WITH (security_invoker=on) AS
SELECT e.id AS elevador_id, e.unidade_id, e.status::text AS status, e.validacao_status::text AS validacao_status, e.facial_situacao::text AS facial_situacao,
  f.id AS facial_id, f.codigo AS facial_codigo, f.instalacao::text AS facial_instalacao,
  CASE
    WHEN e.validacao_status='NAO_VALIDADO' THEN 'AGUARDANDO_VALIDACAO'
    WHEN f.instalacao='INSTALADA' THEN 'CONCLUIDO'
    WHEN f.id IS NOT NULL THEN 'AGUARDANDO_INSTALACAO'
    WHEN e.facial_situacao='NECESSITA_COMPRA' THEN 'NECESSITA_COMPRA'
    WHEN e.facial_situacao='NAO_ENCONTRADO' THEN 'FACIAL_NAO_ENCONTRADO'
    ELSE 'SEM_FACIAL' END AS situacao
FROM public.elev_elevadores e LEFT JOIN public.elev_faciais f ON f.elevador_id=e.id;
GRANT SELECT ON public.elev_v_elevador_situacao TO authenticated, service_role;

CREATE VIEW public.elev_v_unidade_resumo WITH (security_invoker=on) AS
SELECT u.unidade_id,
  count(*) FILTER (WHERE s.elevador_id IS NOT NULL) AS elevadores,
  count(*) FILTER (WHERE s.status='INSTALADO') AS instalados,
  count(*) FILTER (WHERE s.status IS NOT NULL AND s.status<>'INSTALADO') AS pendentes,
  count(*) FILTER (WHERE s.validacao_status='VALIDADO') AS validados,
  count(*) FILTER (WHERE s.validacao_status='NAO_VALIDADO') AS nao_validados,
  count(*) FILTER (WHERE s.facial_id IS NOT NULL) AS com_facial,
  count(*) FILTER (WHERE s.validacao_status='VALIDADO' AND s.facial_id IS NULL) AS sem_facial,
  count(*) FILTER (WHERE s.facial_instalacao='INSTALADA') AS faciais_instalados,
  count(*) FILTER (WHERE s.situacao='AGUARDANDO_INSTALACAO') AS faciais_aguardando,
  count(*) FILTER (WHERE s.situacao IN ('NECESSITA_COMPRA')) AS necessita_compra,
  (SELECT count(*) FROM public.elev_faciais f WHERE f.unidade_id=u.unidade_id AND f.presenca='PRESENTE') AS faciais_presentes,
  (SELECT count(*) FROM public.elev_faciais f WHERE f.unidade_id=u.unidade_id AND f.elevador_id IS NULL AND f.presenca='PRESENTE') AS faciais_sem_elevador
FROM (SELECT unidade_id FROM public.elev_elevadores UNION SELECT unidade_id FROM public.elev_faciais) u
LEFT JOIN public.elev_v_elevador_situacao s ON s.unidade_id=u.unidade_id
GROUP BY u.unidade_id;
GRANT SELECT ON public.elev_v_unidade_resumo TO authenticated, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.elev_faciais;