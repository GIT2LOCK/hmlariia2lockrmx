ALTER TABLE public.links_internet
  ADD COLUMN IF NOT EXISTS ip_estatico character varying DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mascara character varying DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gateway character varying DEFAULT NULL;