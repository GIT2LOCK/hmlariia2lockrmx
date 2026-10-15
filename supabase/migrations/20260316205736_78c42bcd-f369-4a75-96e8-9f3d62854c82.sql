ALTER TABLE public.links_internet RENAME COLUMN tipo_conexao TO tipo_autenticacao;
ALTER TABLE public.links_internet ADD COLUMN pppoe_usuario VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.links_internet ADD COLUMN pppoe_senha VARCHAR(255) DEFAULT NULL;