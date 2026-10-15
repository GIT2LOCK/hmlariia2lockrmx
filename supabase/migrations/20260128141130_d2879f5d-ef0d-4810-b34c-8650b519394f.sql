-- Add rate limiting columns to tb_usuario for brute force protection
ALTER TABLE public.tb_usuario 
ADD COLUMN IF NOT EXISTS verification_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_verification_attempt TIMESTAMPTZ;

-- Drop existing overly permissive policies on sessions table
DROP POLICY IF EXISTS "Users can view own devices" ON public.sessions;

-- Sessions table should have NO SELECT policy - only Edge Functions access it
-- No policy = no access with anon key

-- Create restrictive RLS policy for sessions (deny all direct access)
-- Access is only through Edge Functions using service role key

-- Fix tb_usuario policies - deny direct access to password/secrets
DROP POLICY IF EXISTS "Allow read users for admins" ON public.tb_usuario;
DROP POLICY IF EXISTS "Allow update users for admins" ON public.tb_usuario;
DROP POLICY IF EXISTS "Allow insert users" ON public.tb_usuario;
DROP POLICY IF EXISTS "Allow delete users for admins" ON public.tb_usuario;

-- No SELECT policy = no direct reads with anon key
-- All user data access goes through Edge Functions with service role

-- Fix tb_dispositivo - deny direct access
DROP POLICY IF EXISTS "Users can view own devices" ON public.tb_dispositivo;
DROP POLICY IF EXISTS "Allow insert devices" ON public.tb_dispositivo;
DROP POLICY IF EXISTS "Allow update devices" ON public.tb_dispositivo;
DROP POLICY IF EXISTS "Allow delete devices" ON public.tb_dispositivo;

-- No policies = no direct access
-- Device management goes through Edge Functions

-- Fix tb_email - deny direct access (contains PII)
DROP POLICY IF EXISTS "Allow read emails" ON public.tb_email;
DROP POLICY IF EXISTS "Allow insert emails" ON public.tb_email;
DROP POLICY IF EXISTS "Allow update emails" ON public.tb_email;
DROP POLICY IF EXISTS "Allow delete emails" ON public.tb_email;

-- No policies = no direct access

-- Fix tb_cpf - deny direct access (contains sensitive PII)
DROP POLICY IF EXISTS "Allow read cpf" ON public.tb_cpf;
DROP POLICY IF EXISTS "Allow insert cpf" ON public.tb_cpf;
DROP POLICY IF EXISTS "Allow update cpf" ON public.tb_cpf;
DROP POLICY IF EXISTS "Allow delete cpf" ON public.tb_cpf;

-- No policies = no direct access

-- Keep read-only policies on reference tables (these are safe)
-- tb_permissao, tb_prioridade, tb_via, tb_status - already read-only