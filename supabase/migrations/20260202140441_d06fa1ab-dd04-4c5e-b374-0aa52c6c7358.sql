-- Adicionar política de INSERT para tb_prazo
CREATE POLICY "Allow insert prazo" 
ON public.tb_prazo 
FOR INSERT 
WITH CHECK (true);