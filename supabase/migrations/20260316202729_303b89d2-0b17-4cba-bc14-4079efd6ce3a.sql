
-- Drop old tables if they exist (from previous schema)
DROP TABLE IF EXISTS tb_unidade CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- Create empresas table
CREATE TABLE public.empresas (
  id SERIAL PRIMARY KEY,
  nome_fantasia VARCHAR(255) NOT NULL,
  razao_social VARCHAR(255),
  cnpj VARCHAR(18),
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create unidades table
CREATE TABLE public.unidades (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_unidade VARCHAR(255) NOT NULL,
  codigo_unidade VARCHAR(50),
  nome_antigo VARCHAR(255),
  telefone VARCHAR(20),
  email VARCHAR(255),
  logradouro VARCHAR(255),
  numero VARCHAR(20),
  complemento VARCHAR(100),
  bairro VARCHAR(100),
  cidade VARCHAR(100),
  estado VARCHAR(2),
  cep VARCHAR(9),
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create cobertura_unidade table
CREATE TABLE public.cobertura_unidade (
  id SERIAL PRIMARY KEY,
  unidade_id INTEGER NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  tipo VARCHAR(50),
  descricao TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create operadoras table
CREATE TABLE public.operadoras (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  telefone VARCHAR(20),
  email VARCHAR(255),
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create links_internet table
CREATE TYPE public.finalidade_link AS ENUM ('principal', 'backup');
CREATE TYPE public.tipo_link AS ENUM ('banda_larga', 'link_dedicado', '4g', 'mpls');
CREATE TYPE public.ip_tipo AS ENUM ('dinamico', 'fixo');
CREATE TYPE public.ip_visibilidade AS ENUM ('publico', 'privado');

CREATE TABLE public.links_internet (
  id SERIAL PRIMARY KEY,
  unidade_id INTEGER NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  operadora_id INTEGER NOT NULL REFERENCES public.operadoras(id) ON DELETE RESTRICT,
  nome_link VARCHAR(255),
  finalidade finalidade_link,
  tipo_link tipo_link,
  velocidade_download VARCHAR(50),
  velocidade_upload VARCHAR(50),
  ip_tipo ip_tipo,
  ip_visibilidade ip_visibilidade,
  ddns VARCHAR(255),
  bridge BOOLEAN DEFAULT false,
  canal_atendimento VARCHAR(255),
  telefone_operadora VARCHAR(20),
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create dados_abertura_chamado table
CREATE TABLE public.dados_abertura_chamado (
  id SERIAL PRIMARY KEY,
  link_id INTEGER NOT NULL REFERENCES public.links_internet(id) ON DELETE CASCADE,
  razao_social_abertura VARCHAR(255),
  cnpj_abertura VARCHAR(18),
  numero_contrato VARCHAR(100),
  numero_cliente VARCHAR(100),
  telefone_abertura VARCHAR(20),
  email_abertura VARCHAR(255),
  observacoes_abertura TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobertura_unidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operadoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links_internet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dados_abertura_chamado ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow all for authenticated users (internal IT tool)
CREATE POLICY "Authenticated full access" ON public.empresas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.unidades FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.cobertura_unidade FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.operadoras FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.links_internet FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.dados_abertura_chamado FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also allow anon access for now (since auth is custom via edge functions)
CREATE POLICY "Anon full access" ON public.empresas FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON public.unidades FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON public.cobertura_unidade FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON public.operadoras FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON public.links_internet FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON public.dados_abertura_chamado FOR ALL TO anon USING (true) WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER set_empresas_updated BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();
CREATE TRIGGER set_unidades_updated BEFORE UPDATE ON public.unidades FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();
CREATE TRIGGER set_operadoras_updated BEFORE UPDATE ON public.operadoras FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();
CREATE TRIGGER set_links_internet_updated BEFORE UPDATE ON public.links_internet FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();
CREATE TRIGGER set_dados_abertura_updated BEFORE UPDATE ON public.dados_abertura_chamado FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();
