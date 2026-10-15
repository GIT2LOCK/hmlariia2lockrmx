DROP INDEX IF EXISTS public.inventario_itens_zabbix_hostid_uniq;
ALTER TABLE public.inventario_itens ADD CONSTRAINT inventario_itens_zabbix_hostid_key UNIQUE (zabbix_hostid);