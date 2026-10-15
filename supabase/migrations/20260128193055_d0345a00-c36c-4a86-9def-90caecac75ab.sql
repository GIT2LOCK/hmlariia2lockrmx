-- Remover a coluna empresa da tb_categoria
ALTER TABLE public.tb_categoria DROP COLUMN IF EXISTS empresa;

-- Limpar dados existentes e inserir as novas categorias
TRUNCATE TABLE public.tb_categoria RESTART IDENTITY CASCADE;

-- Popular com as 3 categorias
INSERT INTO public.tb_categoria (categoria) VALUES 
  ('MFA/LA'),
  ('MFB/LU'),
  ('LP/Consultor');