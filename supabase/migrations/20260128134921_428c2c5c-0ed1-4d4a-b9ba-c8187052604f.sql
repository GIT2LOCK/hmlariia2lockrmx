-- ================================================
-- SECURITY FIX: Create sessions table for server-side session validation
-- ================================================

-- Create sessions table to store and validate session tokens
CREATE TABLE public.sessions (
  session_id SERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES public.tb_usuario(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- Create index for faster token lookups
CREATE INDEX idx_sessions_token ON public.sessions(token);
CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON public.sessions(expires_at);

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Sessions can only be accessed by service role (Edge Functions)
-- No public policies - this table is only accessible via Edge Functions with service role key

-- ================================================
-- Create function to cleanup expired sessions (can be called by cron)
-- ================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.sessions WHERE expires_at < NOW();
$$;

-- ================================================
-- Create function to validate session and return user_id
-- ================================================
CREATE OR REPLACE FUNCTION public.validate_session(session_token TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id INTEGER;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.sessions
  WHERE token = session_token
    AND expires_at > NOW();
  
  IF v_user_id IS NOT NULL THEN
    -- Update last activity
    UPDATE public.sessions 
    SET last_activity = NOW() 
    WHERE token = session_token;
  END IF;
  
  RETURN v_user_id;
END;
$$;