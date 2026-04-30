-- N:N relationship: pessoas/responsaveis ↔ unidades
CREATE TABLE public.contato_unidades (
  id SERIAL PRIMARY KEY,
  contato_id INTEGER NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  unidade_id INTEGER NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contato_id, unidade_id)
);

CREATE INDEX idx_contato_unidades_contato ON public.contato_unidades(contato_id);
CREATE INDEX idx_contato_unidades_unidade ON public.contato_unidades(unidade_id);

ALTER TABLE public.contato_unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon full access contato_unidades" ON public.contato_unidades
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access contato_unidades" ON public.contato_unidades
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Responsavel can cover entire empresa (all current + future unidades)
ALTER TABLE public.contatos
  ADD COLUMN cobre_empresa_inteira BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing single unidade_id links into the join table
INSERT INTO public.contato_unidades (contato_id, unidade_id)
SELECT id, unidade_id FROM public.contatos
WHERE unidade_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Mark responsaveis without specific unidade as covering whole empresa
UPDATE public.contatos
SET cobre_empresa_inteira = true
WHERE tipo = 'responsavel'
  AND unidade_id IS NULL
  AND empresa_id IS NOT NULL;
