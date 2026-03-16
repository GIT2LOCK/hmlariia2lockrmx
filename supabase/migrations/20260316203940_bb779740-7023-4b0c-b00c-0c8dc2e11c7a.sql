
-- Create usuarios table for auth
CREATE TABLE public.usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  permissao VARCHAR(20) NOT NULL DEFAULT 'VIEWER' CHECK (permissao IN ('SUPERADMIN', 'ADMIN', 'USER', 'VIEWER')),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create sessions table
CREATE TABLE public.sessions (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT now(),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Policies for usuarios
CREATE POLICY "Authenticated read usuarios" ON public.usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon read usuarios" ON public.usuarios FOR SELECT TO anon USING (true);
CREATE POLICY "Service full access usuarios" ON public.usuarios FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon insert usuarios" ON public.usuarios FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update usuarios" ON public.usuarios FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Policies for sessions
CREATE POLICY "Service full access sessions" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access sessions" ON public.sessions FOR ALL TO anon USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER set_usuarios_updated BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();

-- Create index on sessions token
CREATE INDEX idx_sessions_token ON public.sessions(token);
CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
