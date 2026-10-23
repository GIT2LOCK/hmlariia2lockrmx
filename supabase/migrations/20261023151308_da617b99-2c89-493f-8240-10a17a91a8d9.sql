ALTER TABLE public.ariiatalk_pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ariiatalk_conversa_pastas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ariiatalk_pastas, public.ariiatalk_conversa_pastas FROM anon, authenticated;
GRANT ALL ON public.ariiatalk_pastas, public.ariiatalk_conversa_pastas TO service_role;
DROP INDEX IF EXISTS public.ariiatalk_pastas_nome_uniq;
CREATE UNIQUE INDEX ariiatalk_pastas_owner_nome_uniq ON public.ariiatalk_pastas (criado_por, lower(nome));