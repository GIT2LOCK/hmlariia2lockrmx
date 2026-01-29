-- Add DELETE policy for tb_demanda
CREATE POLICY "Allow delete demandas"
ON public.tb_demanda
FOR DELETE
USING (true);