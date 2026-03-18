ALTER TYPE public.tipo_link ADD VALUE IF NOT EXISTS 'radio';

ALTER TABLE public.links_internet ADD COLUMN IF NOT EXISTS smart_sigma boolean DEFAULT false;