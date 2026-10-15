CREATE TABLE public.elev_cronograma_atividades (
  id bigserial PRIMARY KEY,
  etapa_id bigint NOT NULL REFERENCES public.elev_cronograma_etapas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  responsavel text,
  ordem integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.elev_cronograma_atividades(etapa_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elev_cronograma_atividades TO authenticated;
GRANT USAGE ON SEQUENCE public.elev_cronograma_atividades_id_seq TO authenticated;
GRANT ALL ON public.elev_cronograma_atividades TO service_role;
ALTER TABLE public.elev_cronograma_atividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atv_select" ON public.elev_cronograma_atividades FOR SELECT TO authenticated USING (public.fn_elev_is_staff());
CREATE POLICY "atv_insert" ON public.elev_cronograma_atividades FOR INSERT TO authenticated WITH CHECK (public.fn_elev_is_admin());
CREATE POLICY "atv_update" ON public.elev_cronograma_atividades FOR UPDATE TO authenticated USING (public.fn_elev_is_admin()) WITH CHECK (public.fn_elev_is_admin());
CREATE POLICY "atv_delete" ON public.elev_cronograma_atividades FOR DELETE TO authenticated USING (public.fn_elev_is_admin());
CREATE TRIGGER trg_atv_touch BEFORE UPDATE ON public.elev_cronograma_atividades FOR EACH ROW EXECUTE FUNCTION public.fn_elev_cronograma_touch();

CREATE TABLE public.elev_cronograma_execucoes (
  id bigserial PRIMARY KEY,
  atividade_id bigint NOT NULL REFERENCES public.elev_cronograma_atividades(id) ON DELETE CASCADE,
  etapa_unidade_id bigint NOT NULL REFERENCES public.elev_cronograma_etapa_unidades(id) ON DELETE CASCADE,
  data_inicio date,
  data_fim date,
  status text NOT NULL DEFAULT 'NAO_INICIADO',
  responsavel text,
  observacoes text,
  concluido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atividade_id, etapa_unidade_id)
);
CREATE INDEX ON public.elev_cronograma_execucoes(etapa_unidade_id);
CREATE INDEX ON public.elev_cronograma_execucoes(data_inicio);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elev_cronograma_execucoes TO authenticated;
GRANT USAGE ON SEQUENCE public.elev_cronograma_execucoes_id_seq TO authenticated;
GRANT ALL ON public.elev_cronograma_execucoes TO service_role;
ALTER TABLE public.elev_cronograma_execucoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exe_select" ON public.elev_cronograma_execucoes FOR SELECT TO authenticated USING (public.fn_elev_is_staff());
CREATE POLICY "exe_insert" ON public.elev_cronograma_execucoes FOR INSERT TO authenticated WITH CHECK (public.fn_elev_is_admin());
CREATE POLICY "exe_update" ON public.elev_cronograma_execucoes FOR UPDATE TO authenticated USING (public.fn_elev_is_staff()) WITH CHECK (public.fn_elev_is_staff());
CREATE POLICY "exe_delete" ON public.elev_cronograma_execucoes FOR DELETE TO authenticated USING (public.fn_elev_is_admin());
CREATE TRIGGER trg_exe_touch BEFORE UPDATE ON public.elev_cronograma_execucoes FOR EACH ROW EXECUTE FUNCTION public.fn_elev_cronograma_touch();
CREATE TRIGGER trg_exe_datas BEFORE INSERT OR UPDATE ON public.elev_cronograma_execucoes FOR EACH ROW EXECUTE FUNCTION public.fn_elev_cronograma_validar_datas();

CREATE TABLE public.elev_cronograma_bloqueios (
  id bigserial PRIMARY KEY,
  projeto_id bigint NOT NULL REFERENCES public.elev_cronograma_projetos(id) ON DELETE CASCADE,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  tipo text NOT NULL DEFAULT 'PAUSA',
  descricao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elev_cronograma_bloqueios TO authenticated;
GRANT USAGE ON SEQUENCE public.elev_cronograma_bloqueios_id_seq TO authenticated;
GRANT ALL ON public.elev_cronograma_bloqueios TO service_role;
ALTER TABLE public.elev_cronograma_bloqueios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blq_select" ON public.elev_cronograma_bloqueios FOR SELECT TO authenticated USING (public.fn_elev_is_staff());
CREATE POLICY "blq_write" ON public.elev_cronograma_bloqueios FOR ALL TO authenticated USING (public.fn_elev_is_admin()) WITH CHECK (public.fn_elev_is_admin());
CREATE TRIGGER trg_blq_touch BEFORE UPDATE ON public.elev_cronograma_bloqueios FOR EACH ROW EXECUTE FUNCTION public.fn_elev_cronograma_touch();

ALTER TABLE public.elev_cronograma_dependencias
  ADD COLUMN atividade_id bigint REFERENCES public.elev_cronograma_atividades(id) ON DELETE CASCADE,
  ADD COLUMN depende_de_atividade_id bigint REFERENCES public.elev_cronograma_atividades(id) ON DELETE CASCADE;

ALTER PUBLICATION supabase_realtime ADD TABLE public.elev_cronograma_atividades, public.elev_cronograma_execucoes, public.elev_cronograma_bloqueios;