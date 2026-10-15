-- Adicionar coluna atendente à tabela tb_usuario
ALTER TABLE public.tb_usuario
ADD COLUMN atendente boolean NOT NULL DEFAULT false;