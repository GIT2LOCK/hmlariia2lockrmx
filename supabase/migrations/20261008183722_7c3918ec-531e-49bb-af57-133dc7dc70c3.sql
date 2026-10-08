ALTER TABLE public.inventario_itens
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS zabbix_hostid text,
  ADD COLUMN IF NOT EXISTS host_name text,
  ADD COLUMN IF NOT EXISTS ctrl boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sincronizado_em timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS inventario_itens_zabbix_hostid_uniq ON public.inventario_itens (zabbix_hostid) WHERE zabbix_hostid IS NOT NULL;
GRANT ALL ON public.inventario_itens TO service_role;