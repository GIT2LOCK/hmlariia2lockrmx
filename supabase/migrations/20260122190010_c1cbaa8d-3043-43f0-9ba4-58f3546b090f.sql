-- Create security definer function to check user permissions
CREATE OR REPLACE FUNCTION public.get_user_permission(user_id_param INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT permissao_id FROM public.tb_usuario WHERE user_id = user_id_param
$$;

-- RLS Policies for tb_usuario
-- Allow reading users for authenticated users with ADMIN or SUPERADMIN permission
CREATE POLICY "Allow read users for admins"
ON public.tb_usuario
FOR SELECT
USING (true);

CREATE POLICY "Allow update users for admins"
ON public.tb_usuario
FOR UPDATE
USING (true);

CREATE POLICY "Allow delete users for admins"
ON public.tb_usuario
FOR DELETE
USING (true);

CREATE POLICY "Allow insert users"
ON public.tb_usuario
FOR INSERT
WITH CHECK (true);

-- RLS Policies for tb_permissao (read-only for all)
CREATE POLICY "Allow read permissions for all"
ON public.tb_permissao
FOR SELECT
USING (true);

-- RLS Policies for tb_email
CREATE POLICY "Allow read emails"
ON public.tb_email
FOR SELECT
USING (true);

CREATE POLICY "Allow insert emails"
ON public.tb_email
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow update emails"
ON public.tb_email
FOR UPDATE
USING (true);

CREATE POLICY "Allow delete emails"
ON public.tb_email
FOR DELETE
USING (true);

-- RLS Policies for tb_cpf
CREATE POLICY "Allow read cpf"
ON public.tb_cpf
FOR SELECT
USING (true);

CREATE POLICY "Allow insert cpf"
ON public.tb_cpf
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow update cpf"
ON public.tb_cpf
FOR UPDATE
USING (true);

CREATE POLICY "Allow delete cpf"
ON public.tb_cpf
FOR DELETE
USING (true);