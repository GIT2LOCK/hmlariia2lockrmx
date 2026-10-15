CREATE TABLE public.elev_cronograma_movimentacoes (
  id bigserial PRIMARY KEY,
  projeto_id bigint NOT NULL REFERENCES public.elev_cronograma_projetos(id) ON DELETE CASCADE,
  unidade_id integer NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  de_etapa_id bigint REFERENCES public.elev_cronograma_etapas(id) ON DELETE SET NULL,
  para_etapa_id bigint REFERENCES public.elev_cronograma_etapas(id) ON DELETE CASCADE,
  de_etapa_nome text,
  para_etapa_nome text,
  usuario_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  usuario_nome text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.elev_cronograma_movimentacoes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.elev_cronograma_movimentacoes_id_seq TO authenticated;
GRANT ALL ON public.elev_cronograma_movimentacoes TO service_role;
ALTER TABLE public.elev_cronograma_movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff lê movimentações" ON public.elev_cronograma_movimentacoes FOR SELECT TO authenticated USING (public.fn_elev_is_staff());
CREATE POLICY "Admin registra movimentações" ON public.elev_cronograma_movimentacoes FOR INSERT TO authenticated WITH CHECK (public.fn_elev_is_admin());
CREATE INDEX ON public.elev_cronograma_movimentacoes (projeto_id, unidade_id, criado_em DESC);

CREATE OR REPLACE FUNCTION public.fn_elev_mov_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u record;
BEGIN
  SELECT u.id, u.nome INTO _u FROM public.usuarios u WHERE u.id = (SELECT c.id FROM public.fn_current_usuario() c LIMIT 1);
  NEW.usuario_id := _u.id; NEW.usuario_nome := _u.nome; NEW.criado_em := now();
  SELECT nome INTO NEW.de_etapa_nome FROM public.elev_cronograma_etapas WHERE id = NEW.de_etapa_id;
  SELECT nome INTO NEW.para_etapa_nome FROM public.elev_cronograma_etapas WHERE id = NEW.para_etapa_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_elev_mov_before_insert BEFORE INSERT ON public.elev_cronograma_movimentacoes FOR EACH ROW EXECUTE FUNCTION public.fn_elev_mov_before_insert();
ALTER PUBLICATION supabase_realtime ADD TABLE public.elev_cronograma_movimentacoes;