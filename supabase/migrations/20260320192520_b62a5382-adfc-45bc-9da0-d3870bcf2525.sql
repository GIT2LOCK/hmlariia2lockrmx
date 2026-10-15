
CREATE TABLE public.chamados (
  id SERIAL PRIMARY KEY,
  unidade_id INTEGER NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  link_id INTEGER NOT NULL REFERENCES public.links_internet(id) ON DELETE CASCADE,
  protocolo VARCHAR NOT NULL,
  codigo_servico VARCHAR,
  aberto_por VARCHAR,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon full access chamados" ON public.chamados FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access chamados" ON public.chamados FOR ALL TO authenticated USING (true) WITH CHECK (true);
