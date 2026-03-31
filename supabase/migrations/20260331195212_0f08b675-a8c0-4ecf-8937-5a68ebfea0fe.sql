
-- Add ddns column to unidades
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS ddns character varying DEFAULT NULL;

-- Migrate existing ddns data from links_internet to unidades (pick first non-null per unidade)
UPDATE public.unidades u
SET ddns = sub.ddns
FROM (
  SELECT DISTINCT ON (unidade_id) unidade_id, ddns
  FROM public.links_internet
  WHERE ddns IS NOT NULL AND ddns != ''
  ORDER BY unidade_id, id
) sub
WHERE u.id = sub.unidade_id AND (u.ddns IS NULL OR u.ddns = '');

-- Remove ddns column from links_internet
ALTER TABLE public.links_internet DROP COLUMN IF EXISTS ddns;
