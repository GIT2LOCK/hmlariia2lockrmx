
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid,
  auth_user_id uuid,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_ip text,
  user_agent text
);

GRANT ALL ON public.password_reset_tokens TO service_role;

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- No client access; only service_role (edge functions) operates on this table
CREATE POLICY "no_client_access" ON public.password_reset_tokens
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON public.password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_email ON public.password_reset_tokens(lower(email));
CREATE INDEX IF NOT EXISTS idx_prt_usuario ON public.password_reset_tokens(usuario_id);
CREATE INDEX IF NOT EXISTS idx_prt_expires ON public.password_reset_tokens(expires_at);
