-- Add DELETE policies for company deletion workflow

-- Allow delete on tb_cnpj
CREATE POLICY "Allow delete cnpj"
ON public.tb_cnpj
FOR DELETE
USING (true);

-- Allow delete on tb_cpf_cnpj
CREATE POLICY "Allow delete cpf_cnpj"
ON public.tb_cpf_cnpj
FOR DELETE
USING (true);

-- Allow delete on tb_email
CREATE POLICY "Allow delete email"
ON public.tb_email
FOR DELETE
USING (true);

-- Allow delete on tb_numero
CREATE POLICY "Allow delete numero"
ON public.tb_numero
FOR DELETE
USING (true);

-- Allow delete on tb_endereco
CREATE POLICY "Allow delete endereco"
ON public.tb_endereco
FOR DELETE
USING (true);