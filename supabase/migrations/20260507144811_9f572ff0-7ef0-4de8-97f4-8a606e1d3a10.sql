ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS zabbix_token_z1 text,
  ADD COLUMN IF NOT EXISTS zabbix_token_z2 text;