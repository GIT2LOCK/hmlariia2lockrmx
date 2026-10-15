-- Update Ewerton Melo to SUPERADMIN (permissao_id = 1)
UPDATE public.tb_usuario 
SET permissao_id = 1 
WHERE user_id = 8;