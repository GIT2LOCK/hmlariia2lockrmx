-- Add email verification and 2FA fields to tb_usuario
ALTER TABLE public.tb_usuario
ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS totp_secret TEXT,
ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add email_verified column to tb_email for tracking
ALTER TABLE public.tb_email
ADD COLUMN IF NOT EXISTS verificado BOOLEAN NOT NULL DEFAULT false;