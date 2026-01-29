-- Habilitar RLS e adicionar política de leitura para tb_status
ALTER TABLE public.tb_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read status for all" 
ON public.tb_status 
FOR SELECT 
USING (true);