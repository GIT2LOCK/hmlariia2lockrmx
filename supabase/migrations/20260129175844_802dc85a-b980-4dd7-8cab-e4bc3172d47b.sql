-- Adicionar coluna cidade à tabela tb_endereco
ALTER TABLE public.tb_endereco
ADD COLUMN cidade character varying(100) NULL;