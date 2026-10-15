-- Criar tabela de responsáveis
CREATE TABLE public.tb_responsavel (
  responsavel_id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  cpf_numero VARCHAR(11) NOT NULL UNIQUE,
  rg VARCHAR(20),
  end_id INTEGER REFERENCES public.tb_endereco(end_id),
  telefone_principal VARCHAR(15),
  telefone_alternativo VARCHAR(15),
  email_principal VARCHAR(255),
  email_alternativo VARCHAR(255)
);

-- Criar tabela de relacionamento entre responsáveis e empresas (N:N)
CREATE TABLE public.tb_responsavel_cnpj (
  id SERIAL PRIMARY KEY,
  responsavel_id INTEGER NOT NULL REFERENCES public.tb_responsavel(responsavel_id) ON DELETE CASCADE,
  cnpj_id INTEGER NOT NULL REFERENCES public.tb_cnpj(cnpj_id) ON DELETE CASCADE,
  UNIQUE(responsavel_id, cnpj_id)
);

-- Habilitar RLS
ALTER TABLE public.tb_responsavel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_responsavel_cnpj ENABLE ROW LEVEL SECURITY;

-- Políticas para tb_responsavel
CREATE POLICY "Allow read responsavel for all" ON public.tb_responsavel
FOR SELECT USING (true);

CREATE POLICY "Allow insert responsavel" ON public.tb_responsavel
FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update responsavel" ON public.tb_responsavel
FOR UPDATE USING (true);

CREATE POLICY "Allow delete responsavel" ON public.tb_responsavel
FOR DELETE USING (true);

-- Políticas para tb_responsavel_cnpj
CREATE POLICY "Allow read responsavel_cnpj for all" ON public.tb_responsavel_cnpj
FOR SELECT USING (true);

CREATE POLICY "Allow insert responsavel_cnpj" ON public.tb_responsavel_cnpj
FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update responsavel_cnpj" ON public.tb_responsavel_cnpj
FOR UPDATE USING (true);

CREATE POLICY "Allow delete responsavel_cnpj" ON public.tb_responsavel_cnpj
FOR DELETE USING (true);