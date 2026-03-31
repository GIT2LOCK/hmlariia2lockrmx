
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS ddns_usuario character varying DEFAULT NULL;
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS ddns_senha character varying DEFAULT NULL;
