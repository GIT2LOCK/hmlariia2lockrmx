CREATE TABLE public.inventario_itens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidade_id integer NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('SWITCH','ANTENA')),
  modelo text NOT NULL,
  quantidade integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventario_itens_unidade_idx ON public.inventario_itens(unidade_id, tipo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_itens TO authenticated;
GRANT ALL ON public.inventario_itens TO service_role;
ALTER TABLE public.inventario_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_itens_select" ON public.inventario_itens FOR SELECT TO authenticated USING (coalesce(public.current_ariia_role(),'') <> 'CLIENTE');
CREATE POLICY "inv_itens_write" ON public.inventario_itens FOR ALL TO authenticated
  USING (public.current_ariia_role() IN ('SUPERADMIN','ADMIN','USER'))
  WITH CHECK (public.current_ariia_role() IN ('SUPERADMIN','ADMIN','USER'));

CREATE TABLE public.inventario_unidade (
  unidade_id integer PRIMARY KEY REFERENCES public.unidades(id) ON DELETE CASCADE,
  wan_qtd_links integer CHECK (wan_qtd_links >= 0),
  wan_problemas boolean NOT NULL DEFAULT false,
  camera_tipo text CHECK (camera_tipo IN ('IP','ANALOG')),
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_unidade TO authenticated;
GRANT ALL ON public.inventario_unidade TO service_role;
ALTER TABLE public.inventario_unidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_un_select" ON public.inventario_unidade FOR SELECT TO authenticated USING (coalesce(public.current_ariia_role(),'') <> 'CLIENTE');
CREATE POLICY "inv_un_write" ON public.inventario_unidade FOR ALL TO authenticated
  USING (public.current_ariia_role() IN ('SUPERADMIN','ADMIN','USER'))
  WITH CHECK (public.current_ariia_role() IN ('SUPERADMIN','ADMIN','USER'));

CREATE TRIGGER inv_itens_touch BEFORE UPDATE ON public.inventario_itens FOR EACH ROW EXECUTE FUNCTION public.fn_elev_cronograma_touch();
CREATE TRIGGER inv_un_touch BEFORE UPDATE ON public.inventario_unidade FOR EACH ROW EXECUTE FUNCTION public.fn_elev_cronograma_touch();