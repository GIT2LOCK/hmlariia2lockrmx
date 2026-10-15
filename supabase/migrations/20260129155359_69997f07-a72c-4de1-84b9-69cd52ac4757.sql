-- Add DELETE policy for tb_usuario table
CREATE POLICY "Allow delete usuario"
ON public.tb_usuario
FOR DELETE
USING (true);

-- Add UPDATE policy for tb_usuario table (needed for status changes)
CREATE POLICY "Allow update usuario"
ON public.tb_usuario
FOR UPDATE
USING (true);

-- Add INSERT policy for tb_usuario table (needed for creating users)
CREATE POLICY "Allow insert usuario"
ON public.tb_usuario
FOR INSERT
WITH CHECK (true);

-- Add UPDATE policy for tb_cpf table
CREATE POLICY "Allow update cpf"
ON public.tb_cpf
FOR UPDATE
USING (true);

-- Add DELETE policy for tb_cpf table
CREATE POLICY "Allow delete cpf"
ON public.tb_cpf
FOR DELETE
USING (true);

-- Add UPDATE policy for tb_email table
CREATE POLICY "Allow update email"
ON public.tb_email
FOR UPDATE
USING (true);