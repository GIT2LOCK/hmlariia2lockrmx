ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS tema TEXT NOT NULL DEFAULT 'light';

-- Corrige valores inválidos, caso existam.
UPDATE public.usuarios
SET tema = 'light'
WHERE tema IS NULL
   OR tema NOT IN ('light', 'dark', 'goodstorage');

-- Restringe os valores aceitos.
ALTER TABLE public.usuarios
DROP CONSTRAINT IF EXISTS usuarios_tema_check;

ALTER TABLE public.usuarios
ADD CONSTRAINT usuarios_tema_check
CHECK (tema IN ('light', 'dark', 'goodstorage'));