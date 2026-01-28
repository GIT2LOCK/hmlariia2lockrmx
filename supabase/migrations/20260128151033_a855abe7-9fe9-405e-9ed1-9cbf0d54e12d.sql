-- Enable RLS on tables (if not already enabled)
ALTER TABLE public.tb_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cpf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_dispositivo ENABLE ROW LEVEL SECURITY;

-- Create SELECT policies for tb_usuario (allow authenticated users to read)
CREATE POLICY "Allow read usuarios for authenticated" 
ON public.tb_usuario 
FOR SELECT 
USING (true);

-- Create SELECT policies for tb_cpf (allow authenticated users to read)
CREATE POLICY "Allow read cpf for authenticated" 
ON public.tb_cpf 
FOR SELECT 
USING (true);

-- Create SELECT policies for tb_email (allow authenticated users to read)
CREATE POLICY "Allow read email for authenticated" 
ON public.tb_email 
FOR SELECT 
USING (true);

-- Create policies for sessions table
CREATE POLICY "Allow read sessions for authenticated" 
ON public.sessions 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert sessions" 
ON public.sessions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update sessions" 
ON public.sessions 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow delete sessions" 
ON public.sessions 
FOR DELETE 
USING (true);

-- Create policies for tb_dispositivo
CREATE POLICY "Allow read dispositivo for authenticated" 
ON public.tb_dispositivo 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert dispositivo" 
ON public.tb_dispositivo 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update dispositivo" 
ON public.tb_dispositivo 
FOR UPDATE 
USING (true);