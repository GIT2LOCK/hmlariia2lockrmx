ALTER TABLE public.usuarios ADD COLUMN totp_secret TEXT DEFAULT NULL;
ALTER TABLE public.usuarios ADD COLUMN totp_enabled BOOLEAN DEFAULT false;