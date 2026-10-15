-- Adicionar campos CCM e CASN à tabela tb_cnpj
ALTER TABLE public.tb_cnpj 
ADD COLUMN ccm VARCHAR(25),
ADD COLUMN casn CHAR(12);

COMMENT ON COLUMN public.tb_cnpj.ccm IS 'Cadastro de Contribuintes Mobiliários (CCM) - obrigatório';
COMMENT ON COLUMN public.tb_cnpj.casn IS 'CASN - somente números';