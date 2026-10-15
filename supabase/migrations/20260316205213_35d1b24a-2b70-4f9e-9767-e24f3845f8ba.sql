-- New columns on unidades
ALTER TABLE public.unidades ADD COLUMN abreviacao VARCHAR(10) DEFAULT NULL;
ALTER TABLE public.unidades ADD COLUMN antiga_razao VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.unidades ADD COLUMN rede_default VARCHAR(50) DEFAULT NULL;
ALTER TABLE public.unidades ADD COLUMN wifi_antenas BOOLEAN DEFAULT false;
ALTER TABLE public.unidades ADD COLUMN email_regional VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.unidades ADD COLUMN contato_nome VARCHAR(255) DEFAULT NULL;

-- New column on links_internet for connection mode (DHCP, PPPoE, Static, etc.)
ALTER TABLE public.links_internet ADD COLUMN tipo_conexao VARCHAR(50) DEFAULT NULL;