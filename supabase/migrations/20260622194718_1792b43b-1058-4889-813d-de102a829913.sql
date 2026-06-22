ALTER TABLE public.password_reset_tokens
  ALTER COLUMN usuario_id TYPE integer USING NULL;
-- Foreign key opcional
ALTER TABLE public.password_reset_tokens
  ADD CONSTRAINT password_reset_tokens_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;