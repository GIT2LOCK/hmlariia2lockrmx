-- Add INSERT policy for tb_tipodemanda (for admins)
CREATE POLICY "Allow insert tipodemanda"
ON public.tb_tipodemanda
FOR INSERT
WITH CHECK (true);

-- Add DELETE policy for tb_tipodemanda (for admins)
CREATE POLICY "Allow delete tipodemanda"
ON public.tb_tipodemanda
FOR DELETE
USING (true);