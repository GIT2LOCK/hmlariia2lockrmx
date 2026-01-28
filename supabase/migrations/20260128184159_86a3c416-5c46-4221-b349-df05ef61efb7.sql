-- 1. Remover a foreign key constraint de tb_cnpj para tb_agencia
ALTER TABLE public.tb_cnpj DROP CONSTRAINT IF EXISTS tb_cnpj_agen_id_fkey;

-- 2. Remover a coluna agen_id de tb_cnpj
ALTER TABLE public.tb_cnpj DROP COLUMN IF EXISTS agen_id;

-- 3. Adicionar nova coluna para nome da agência diretamente em tb_cnpj
ALTER TABLE public.tb_cnpj ADD COLUMN IF NOT EXISTS agencia character varying NULL;

-- 4. Adicionar nova coluna para CNPJ superior (14 dígitos)
ALTER TABLE public.tb_cnpj ADD COLUMN IF NOT EXISTS superior_cnpj character varying(14) NULL;

-- 5. Remover a tabela tb_agencia (não será mais utilizada)
DROP TABLE IF EXISTS public.tb_agencia;