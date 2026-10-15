-- Habilitar RLS nas tabelas de suporte
ALTER TABLE public.tb_endereco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_numero ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura e escrita para tb_endereco
CREATE POLICY "Allow read endereco for all"
ON public.tb_endereco FOR SELECT
USING (true);

CREATE POLICY "Allow insert endereco"
ON public.tb_endereco FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow update endereco"
ON public.tb_endereco FOR UPDATE
USING (true);

-- Políticas de leitura e escrita para tb_numero
CREATE POLICY "Allow read numero for all"
ON public.tb_numero FOR SELECT
USING (true);

CREATE POLICY "Allow insert numero"
ON public.tb_numero FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow update numero"
ON public.tb_numero FOR UPDATE
USING (true);

-- Políticas de inserção para tb_cnpj
CREATE POLICY "Allow insert cnpj"
ON public.tb_cnpj FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow update cnpj"
ON public.tb_cnpj FOR UPDATE
USING (true);

-- Políticas de inserção para tb_cpf_cnpj
CREATE POLICY "Allow insert cpf_cnpj"
ON public.tb_cpf_cnpj FOR INSERT
WITH CHECK (true);