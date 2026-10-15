-- Criar política de SELECT para tb_categoria permitir leitura
CREATE POLICY "Allow read categoria for all"
ON public.tb_categoria
FOR SELECT
USING (true);