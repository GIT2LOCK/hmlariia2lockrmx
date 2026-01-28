-- Adicionar política de INSERT para tb_email (necessário para cadastro de empresas)
CREATE POLICY "Allow insert email"
ON public.tb_email
FOR INSERT
WITH CHECK (true);

-- Adicionar política de INSERT para tb_cpf (necessário para cadastro de empresas)
CREATE POLICY "Allow insert cpf"
ON public.tb_cpf
FOR INSERT
WITH CHECK (true);