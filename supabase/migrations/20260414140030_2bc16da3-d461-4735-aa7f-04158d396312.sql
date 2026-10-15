
-- Create tipo_contato enum
CREATE TYPE public.tipo_contato AS ENUM ('pessoa', 'responsavel');

-- Create unified contatos table
CREATE TABLE public.contatos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR NOT NULL,
  telefone VARCHAR,
  email VARCHAR,
  tipo tipo_contato NOT NULL,
  unidade_id INTEGER REFERENCES public.unidades(id) ON DELETE CASCADE,
  empresa_id INTEGER REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT contatos_pessoa_unidade CHECK (tipo != 'pessoa' OR unidade_id IS NOT NULL),
  CONSTRAINT contatos_responsavel_empresa CHECK (tipo != 'responsavel' OR empresa_id IS NOT NULL)
);

-- Migrate data from pessoas
INSERT INTO public.contatos (nome, telefone, tipo, unidade_id, criado_em, atualizado_em)
SELECT nome, telefone, 'pessoa', unidade_id, criado_em, atualizado_em
FROM public.pessoas;

-- Migrate data from responsaveis
INSERT INTO public.contatos (nome, telefone, email, tipo, empresa_id, criado_em, atualizado_em)
SELECT nome, telefone, email, 'responsavel', empresa_id, criado_em, atualizado_em
FROM public.responsaveis;

-- Enable RLS
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon full access contatos" ON public.contatos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access contatos" ON public.contatos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Drop old tables
DROP TABLE public.pessoas;
DROP TABLE public.responsaveis;
